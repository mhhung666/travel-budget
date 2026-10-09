// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expensePreviewV2Input,
  expensePreviewV2Schema,
  expenseCreateV2Input,
  expenseSplitInput,
  expenseOptionsV2Schema,
  ledgerCapabilitiesSchema,
} from '@travel-budget/contracts';
import { computeLedgerSplits, type SplitMode } from '@/lib/expenseSplit';
import { authorizeLedger, ledgerCapabilities } from '@/lib/ledger';
import { ApiError } from '@/lib/mobile/http';

const state = vi.hoisted(() => ({
  base: 'TWD',
  allowed: true,
  signedIn: true,
  members: [] as unknown[],
}));
vi.mock('@/lib/mobile/session', () => ({
  requireMobileUser: async () => {
    if (!state.signedIn) throw new ApiError(401, 'UNAUTHORIZED');
    return 'a'.repeat(24);
  },
}));
vi.mock('@/lib/mobile/access', () => ({
  requireTripMember: async (_user: string, id: string) => {
    if (!state.allowed) throw new ApiError(404, 'NOT_FOUND');
    authorizeLedger({ baseCurrency: state.base });
    return id;
  },
}));
vi.mock('@/models', () => ({
  Trip: {
    findById: () => {
      const query = {
        select: () => query,
        populate: () => query,
        lean: async () => ({ members: state.members }),
      };
      return query;
    },
  },
}));
import { POST } from '@/app/api/v2/trips/[id]/expenses/preview/route';
import { GET as optionsGET } from '@/app/api/v2/trips/[id]/expense-options/route';
const ids = ['a', 'b', 'c'].map((s) => s.repeat(24));
const params = { params: Promise.resolve({ id: 'd'.repeat(24) }) };
const body = (extra: object = {}) => ({
  base_currency: state.base,
  currency: state.base,
  exchange_rate: 1,
  amount: 100.01,
  member_ids: ids,
  ...extra,
});
async function preview(input: unknown) {
  const response = await POST(
    new Request('http://localhost/api/v2/trips/x/expenses/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
    params
  );
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  return { status: response.status, ...(await response.json()) };
}
beforeEach(() => {
  state.base = 'TWD';
  state.allowed = true;
  state.signedIn = true;
  // Stored order differs; tied names and a virtual member do not change identity/order.
  state.members = [
    ...[2, 0, 1].map((i) => ({
      user: { _id: ids[i], displayName: 'Same name', isVirtual: i === 1 },
      joinedAt: new Date(`2026-10-0${i + 1}T00:00:00Z`),
    })),
    { user: null },
  ];
});

describe('G3 preview contract', () => {
  it('keeps the old equal shape and advertises split capabilities without changing legacy bodies', async () => {
    const result = await preview(body());
    expect(result.status).toBe(200);
    expect(result.data.splitMode).toBeUndefined();
    expect(result.data.splits).toEqual(
      ids.map((userId, i) => ({
        userId,
        displayName: 'Same name',
        shareAmount: [33.34, 33.34, 33.33][i],
      }))
    );
    expect(expensePreviewV2Schema.safeParse(result.data).success).toBe(true);
    const options = await optionsGET(new Request('http://localhost'), params);
    const data = (await options.json()).data;
    expect(expenseOptionsV2Schema.parse(data).splitPreviewModes).toEqual([
      'equal',
      'amount',
      'percent',
      'shares',
    ]);
    // Existing clients strictly decode global capabilities: do not add new keys there.
    expect(ledgerCapabilitiesSchema.parse(ledgerCapabilities())).toEqual(ledgerCapabilities());
    const confirmed = {
      base_currency: 'TWD',
      client_request_id: '017fd635-8dc2-41c1-bf6a-ecbe40f18f90',
      payer_id: ids[0],
      original_amount: 100.01,
      currency: 'TWD',
      exchange_rate: 1,
      description: 'Dinner',
      category: 'food',
      date: '2026-10-09',
      splits: ids.map((user_id, i) => ({ user_id, share_amount: [33.34, 33.34, 33.33][i] })),
    };
    expect(expenseCreateV2Input.parse(confirmed)).toEqual(confirmed);
    expect(
      expenseCreateV2Input.safeParse({ ...confirmed, split: { mode: 'shares', values: [1, 2, 3] } })
        .success
    ).toBe(true);
  });

  it.each([
    ['equal', undefined],
    ['amount', [20, null, null]],
    ['percent', [33.33, 33.33, 33.33]],
    ['shares', [1, 2, 3]],
    ['shares', [0, null, 2]],
    ['percent', [0, null, 25]],
    ['amount', [0, 0, 100]],
    ['shares', [0.0001, 1_000_000, null]],
  ] as [SplitMode, (number | null)[] | undefined][])(
    'matches Web computation for %s, including reversed request order',
    async (mode, values) => {
      const amount = 100;
      const expected = computeLedgerSplits(
        mode,
        ids.map((id, i) => ({
          id,
          selected: true,
          value: values?.[i] == null ? '' : String(values[i]),
        })),
        amount,
        1
      );
      const split = mode === 'equal' ? { mode } : { mode, values: [...values!].reverse() };
      const result = await preview(body({ amount, member_ids: [...ids].reverse(), split }));
      expect(result.status).toBe(200);
      expect(result.data.splitMode).toBe(mode);
      expect(result.data.splits).toEqual(
        ids.map((userId) => ({
          userId,
          displayName: 'Same name',
          shareAmount: expected.ledger[userId],
          originalShareAmount: expected.original[userId],
        }))
      );
      expect(expensePreviewV2Schema.safeParse(result.data).success).toBe(true);
    }
  );

  it.each([
    ['TWD', 'USD', 100.01, 32.15],
    ['USD', 'JPY', 3000, 0.0067],
    ['JPY', 'JPY', 100.01, 1],
    ['USD', 'TWD', 0.01, 0.00001],
    ['TWD', 'JPY', 0.01, 1e11],
    ['TWD', 'JPY', 1e9, 1e-12],
  ] as const)(
    'preserves original and ledger cents for %s/%s (%s × %s)',
    async (base, currency, amount, rate) => {
      state.base = base;
      const result = await preview(
        body({
          currency,
          amount,
          exchange_rate: rate,
          split: { mode: 'shares', values: [1, 2, 3] },
        })
      );
      expect(result.status).toBe(200);
      expect(result.data.ledger.baseCurrency).toBe(base);
      const expected = computeLedgerSplits(
        'shares',
        ids.map((id, i) => ({ id, selected: true, value: String(i + 1) })),
        amount,
        rate
      );
      expect(result.data.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual(
        Object.values(expected.ledger)
      );
      expect(expensePreviewV2Schema.safeParse(result.data).success).toBe(true);
    }
  );

  it.each([
    '',
    ' ',
    '1junk',
    '1e2',
    '0x10',
    'Infinity',
    'NaN',
    '1,000',
    true,
    {},
    -1,
    Infinity,
    NaN,
    0.001,
  ])('rejects malformed percent input %s without coercion', (value) => {
    expect(expenseSplitInput.safeParse({ mode: 'percent', values: [value] }).success).toBe(false);
  });
  it.each([
    { mode: 'equal', values: [1, 1, 1] },
    { mode: 'unknown' },
    { mode: 'amount', values: [1, 2] },
    { mode: 'shares', values: [0, 0, 0] },
    { mode: 'amount', values: [0, 0, 0] },
    { mode: 'percent', values: [0, 0, 0] },
    { mode: 'percent', values: [100.01, null, null] },
    { mode: 'shares', values: [1000000.0001, 1, 1] },
    { mode: 'shares', values: [0.00001, 1, 1] },
    { mode: 'amount', values: [0.001, null, null] },
  ])('rejects invalid split structure/range %j', async (split) => {
    expect(expensePreviewV2Input.safeParse(body({ split })).success).toBe(false);
    expect((await preview(body({ split }))).status).toBe(400);
  });
  it.each([
    { mode: 'amount', values: [10, 10, 10] },
    { mode: 'amount', values: [101, null, null] },
    { mode: 'percent', values: [50, 51, null] },
    { mode: 'percent', values: [10, 10, 10] },
  ])('rejects unbalanced allocations %j', async (split) => {
    expect((await preview(body({ split }))).status).toBe(400);
  });
  it('uses original-money tolerance, not percentage tolerance, and rejects zero weights even for one cent', async () => {
    const split = { mode: 'percent', values: [33.33, 33.33, 33.33] };
    expect((await preview(body({ amount: 100, split }))).status).toBe(200);
    expect((await preview(body({ amount: 1000, split }))).status).toBe(400);
    expect(
      (await preview(body({ amount: 0.01, split: { mode: 'shares', values: [0, 0, 0] } }))).status
    ).toBe(400);
  });
  it('rejects member mismatches, unsupported currency, wrong base, and conversion overflow', async () => {
    for (const overrides of [
      { member_ids: [ids[0], ids[0], ids[2]] },
      { member_ids: [ids[0], ids[1], 'e'.repeat(24)] },
      { currency: 'ZZZ' },
      { base_currency: 'USD' },
      { currency: 'JPY', exchange_rate: 1e20 },
    ])
      expect([400, 409]).toContain(
        (await preview(body({ ...overrides, split: { mode: 'shares', values: [1, 2, 3] } }))).status
      );
  });
  it('authorizes before parsing and rejects removed users', async () => {
    state.allowed = false;
    expect((await preview({ split: 'bad' })).status).toBe(404);
    state.signedIn = false;
    expect((await preview({})).status).toBe(401);
  });
  it('fits all 100 participants within the existing 8 KiB request limit', async () => {
    const member_ids = Array.from({ length: 100 }, (_, i) =>
      (i + 1).toString(16).padStart(24, '0')
    );
    state.members = member_ids.map((_id) => ({ user: { _id, displayName: 'Member' } }));
    const input = body({
      member_ids,
      split: { mode: 'shares', values: member_ids.map(() => 999999.9999) },
    });
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(8192);
    expect((await preview(input)).status).toBe(200);
    expect(
      expensePreviewV2Input.safeParse({ ...input, member_ids: [...member_ids, 'f'.repeat(24)] })
        .success
    ).toBe(false);
  });

  it('requires both original and ledger sums, while accepting old responses', async () => {
    const { data } = await preview(body({ split: { mode: 'shares', values: [1, 2, 3] } }));
    for (const field of ['originalShareAmount', 'shareAmount']) {
      const broken = structuredClone(data);
      broken.splits[0][field] += 0.01;
      expect(expensePreviewV2Schema.safeParse(broken).success).toBe(false);
    }
    const missing = structuredClone(data);
    delete missing.splits[0].originalShareAmount;
    expect(expensePreviewV2Schema.safeParse(missing).success).toBe(false);
  });
});
