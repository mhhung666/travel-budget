// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  expenseCreateInput,
  expenseCreateV2Input,
  expensePreviewV2Input,
  expenseUpdateV2Input,
  expensePreviewV2Schema,
  ledgerSchema,
  tripCreateV2Input,
  mutationRequestV2Schema,
} from '@travel-budget/contracts';
import {
  authorizeLedger,
  baseCurrency,
  assertUnit,
  withLedgerV2,
  parseLedgerInput,
  currentLedger,
  ledgerFingerprint,
  checkReceiptVersion,
  moneyTotal,
} from '@/lib/ledger';
import { createTripSchema, updateTripSchema } from '@/lib/validation';
import { computeLedgerSplits, computeSplits } from '@/lib/expenseSplit';
import { rebaseReferenceRates } from '@/lib/referenceRates';
const ids = ['a', 'b', 'c'].map((c) => c.repeat(24));
const input = {
  client_request_id: randomUUID(),
  base_currency: 'USD',
  payer_id: ids[0],
  original_amount: 3000,
  currency: 'JPY',
  exchange_rate: 0.0067,
  description: 'Dinner',
  category: 'food',
  date: '2026-10-08',
  splits: ids.map((user_id) => ({ user_id, share_amount: 6.7 })),
};
const members = ids.map((id) => ({ id, selected: true, value: '' }));
describe('immutable two-decimal ledger contract', () => {
  it('keeps the v1 strict shape and accepts an explicit v2 USD/JPY command', () => {
    expect(expenseCreateInput.safeParse(input).success).toBe(false);
    expect(expenseCreateV2Input.parse(input).base_currency).toBe('USD');
  });
  it.each(['USD', 'JPY', 'TWD'])('allows base %s at rate 1 with two decimal places', (base) => {
    expect(
      expensePreviewV2Input.safeParse({
        base_currency: base,
        currency: base,
        exchange_rate: 1,
        amount: 100.01,
        member_ids: ids,
      }).success
    ).toBe(true);
  });
  it.each([0, 0.001, 1000000000.01])('rejects an invalid base amount %s', (amount) => {
    expect(
      expensePreviewV2Input.safeParse({
        base_currency: 'JPY',
        currency: 'JPY',
        exchange_rate: 1,
        amount,
        member_ids: ids,
      }).success
    ).toBe(false);
  });
  it('treats TWD as a foreign currency in a USD ledger', () => {
    expect(
      expenseCreateV2Input.safeParse({
        ...input,
        currency: 'TWD',
        exchange_rate: 0.03,
        original_amount: 100,
      }).success
    ).toBe(true);
    expect(
      expenseCreateV2Input.safeParse({ ...input, currency: 'USD', exchange_rate: 30 }).success
    ).toBe(false);
  });
  it('does not permit equal editing without an explicit original currency and rate', () => {
    const changes = { original_amount: 3000, payer_id: ids[0], splits: input.splits };
    expect(
      expenseUpdateV2Input.safeParse({
        client_request_id: randomUUID(),
        expected_revision: 'd'.repeat(64),
        base_currency: 'USD',
        mode: 'equal',
        changes,
      }).success
    ).toBe(false);
  });
  it('requires the ledger unit on v2 outputs and uses exactly scale 2', () => {
    expect(ledgerSchema.safeParse({ baseCurrency: 'JPY', moneyScale: 0 }).success).toBe(false);
    const body = {
      amount: 20.1,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0067,
      splits: ids.map((userId) => ({ userId, displayName: 'A', shareAmount: 6.7 })),
    };
    expect(expensePreviewV2Schema.safeParse(body).success).toBe(false);
    expect(
      expensePreviewV2Schema.safeParse({ ...body, ledger: { baseCurrency: 'USD', moneyScale: 2 } })
        .success
    ).toBe(true);
  });
  it('uses the unchanged allocation and rounding for TWD and JPY fractional cents', () => {
    const neutral = computeLedgerSplits('equal', members, 100.01, 1);
    expect(Object.values(neutral.ledger)).toEqual([33.34, 33.34, 33.33]);
    expect(computeSplits('equal', members, 100.01, 1).twd).toEqual(neutral.ledger);
    expect(Object.values(computeLedgerSplits('equal', members, 3000, 0.0067).ledger)).toEqual([
      6.7, 6.7, 6.7,
    ]);
  });
  it('derives USD quotes only from a consistent dated snapshot', () => {
    const data = {
      rates: { TWD: 1, USD: 30, JPY: 0.21, EUR: 35 },
      dates: { USD: '2026-10-07', JPY: '2026-10-07', EUR: '2026-10-06' },
      provider: 'Frankfurter' as const,
    };
    const result = rebaseReferenceRates(data, 'USD', ['USD', 'TWD', 'JPY', 'EUR', 'THB']);
    expect(result.rates).toEqual({ USD: 1, TWD: 1 / 30, JPY: 0.007 });
    expect(result.unavailable).toEqual(['EUR', 'THB']);
    expect(result.dates.TWD).toBe('2026-10-07');
  });
  it('never substitutes a missing base quote', () => {
    const result = rebaseReferenceRates(
      { rates: { TWD: 1, JPY: 0.21 }, dates: { JPY: '2026-10-07' }, provider: 'Frankfurter' },
      'USD',
      ['USD', 'TWD', 'JPY']
    );
    expect(result.rates).toEqual({ USD: 1 });
    expect(result.unavailable).toEqual(['TWD', 'JPY']);
  });
  it('only absence means legacy TWD; invalid or mismatched units fail', () => {
    expect(baseCurrency({})).toBe('TWD');
    for (const baseCurrency of [null, '', 'INVALID', 1])
      expect(() => authorizeLedger({ baseCurrency })).toThrow('LEDGER_DATA_INVALID');
    expect(() => assertUnit({}, 'USD')).toThrow('LEDGER_DATA_INVALID');
    expect(() => authorizeLedger({ baseCurrency: 'USD' })).toThrow('CLIENT_UPGRADE_REQUIRED');
  });
  it('isolates concurrent request contexts and retains the frozen fingerprint identity', async () => {
    const values = await Promise.all(
      ['USD', 'JPY'].map((base) =>
        withLedgerV2(async () => {
          parseLedgerInput(tripCreateV2Input, {
            client_request_id: randomUUID(),
            name: base,
            base_currency: base,
          });
          authorizeLedger({ baseCurrency: base });
          await new Promise((resolve) => setTimeout(resolve, base === 'USD' ? 5 : 1));
          return [currentLedger().baseCurrency, ledgerFingerprint(input)];
        })
      )
    );
    expect(values.map((v) => v[0])).toEqual(['USD', 'JPY']);
    expect(ledgerFingerprint(input)).toBe(input);
    expect(() => checkReceiptVersion({ contractVersion: 2 })).toThrow('CLIENT_UPGRADE_REQUIRED');
    withLedgerV2(() => expect(() => checkReceiptVersion({})).toThrow('CLIENT_UPGRADE_REQUIRED'));
  });
  it('accepts durable terminal currency rejection without pretending it committed', () => {
    expect(
      mutationRequestV2Schema.safeParse({
        status: 'rejected',
        operation: 'expense.update',
        code: 'LEDGER_CURRENCY_MISMATCH',
        tripId: ids[0],
        ledger: { baseCurrency: 'USD', moneyScale: 2 },
      }).success
    ).toBe(true);
  });
  it('refuses unknown receipt versions instead of treating them as legacy v1', () => {
    expect(() => checkReceiptVersion({ contractVersion: 3 })).toThrow('CLIENT_UPGRADE_REQUIRED');
    withLedgerV2(() =>
      expect(() => checkReceiptVersion({ contractVersion: null })).toThrow(
        'CLIENT_UPGRADE_REQUIRED'
      )
    );
  });
  it('refuses a stored receipt ledger that differs from the authorized trip', () =>
    withLedgerV2(() => {
      authorizeLedger({ baseCurrency: 'USD' });
      expect(() =>
        checkReceiptVersion({ contractVersion: 2, ledger: { baseCurrency: 'JPY', moneyScale: 2 } })
      ).toThrow('LEDGER_DATA_INVALID');
    }));
  it('rejects ledger selection and updates through legacy Web form schemas', () => {
    for (const field of ['base_currency', 'baseCurrency']) {
      expect(createTripSchema.safeParse({ name: 'Trip', [field]: 'USD' }).success).toBe(false);
      expect(updateTripSchema.safeParse({ name: 'Trip', [field]: 'USD' }).success).toBe(false);
    }
  });
  it('uses safe integer-cent totals without silently capping aggregate amounts', () => {
    expect(moneyTotal([1000000000, 1000000000, 0.01])).toBe(2000000000.01);
    expect(moneyTotal([0.1, 0.2])).toBe(0.3);
    expect(() => moneyTotal([Number.MAX_SAFE_INTEGER])).toThrow('MONEY_TOTAL_OUT_OF_RANGE');
  });
});

it('validates forty mixed-ledger trips with only two indexed child probes', async () => {
  const { mongo } = await import('mongoose');
  const { validateLedgerChildrenBatch } = await import('@/lib/ledger');
  const { vi } = await import('vitest');
  const findOne = vi.fn().mockResolvedValue(null);
  const db = { collection: vi.fn(() => ({ findOne })) } as unknown as import('mongoose').mongo.Db;
  const trips = Array.from({ length: 40 }, (_, i) => ({
    _id: new mongo.ObjectId(),
    ...(i % 2 ? { baseCurrency: 'USD' } : {}),
  }));
  await validateLedgerChildrenBatch(db, trips);
  expect(findOne).toHaveBeenCalledTimes(2);
  const clauses = findOne.mock.calls[0][0].$or;
  expect(clauses).toHaveLength(2);
  expect(clauses.map((v: { trip: { $in: unknown[] } }) => v.trip.$in.length)).toEqual([20, 20]);
  expect(clauses[0].$nor).toEqual([{ baseCurrency: 'TWD' }, { baseCurrency: { $exists: false } }]);
  expect(clauses[1].baseCurrency).toEqual({ $ne: 'USD' });
  findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: new mongo.ObjectId() });
  await expect(validateLedgerChildrenBatch(db, trips)).rejects.toThrow('LEDGER_DATA_INVALID');
});
it('rejects a private budget in the wrong unit even in a batched read', async () => {
  const { mongo } = await import('mongoose');
  const { validateLedgerChildrenBatch } = await import('@/lib/ledger');
  await expect(
    validateLedgerChildrenBatch({} as import('mongoose').mongo.Db, [
      {
        _id: new mongo.ObjectId(),
        baseCurrency: 'USD',
        members: [{ budget: { baseCurrency: 'JPY', total: 1 } }],
      },
    ])
  ).rejects.toThrow('LEDGER_DATA_INVALID');
});
