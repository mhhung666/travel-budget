import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClient, ApiError, validateBaseUrl } from '@/api/client';
import { retiredExpense, retiredOperation } from '@/api/recovery';
import { insertLegacyPending } from '@/test/legacy';
import { baseCurrency } from '@/api/ledger';
import {
  expenseOptionsSchema,
  mutationRequestSchema,
  ledgerCapabilitiesSchema,
  type ExpenseOptions,
  type ExpensePreview,
} from '@/api/contracts';
import { memoryDatabase } from '@/test/sqlite';
import { createPendingExpenseStore, type PendingExpense } from '@/storage/pendingExpenses';
import { createMutationStore } from '@/storage/mutations';
import { createExpenseQueueStore } from '@/storage/expenseQueue';
import { isTwdQueueDraft } from '@/storage/expenseDrafts';
import { createDraftTripStore } from '@/storage/draftTrips';
import { ExpenseEntry } from './entry';
import { TripEntry } from '@/features/tripEntry/engine';
import {
  newDraft,
  previewInputOf,
  confirmedFields,
  currencyDefaults,
  validateDraft,
  draftRate,
} from './draft';
import { editChanges } from './maintenance';
import { currencyFields, currencySettings } from '@/features/trips/currencyForm';
import { paymentInput, preparePayment } from '@/features/settlement/paymentForm';
import { formatOriginalAmount } from '@/i18n/format';
const id = (n: number) => n.toString(16).padStart(24, '0');
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const scope = { environment: 'https://test.invalid/api/v1', accountId: id(1) };
const tripId = id(9);
const ledger = { baseCurrency: 'USD', moneyScale: 2 as const };
const options: ExpenseOptions = {
  ledger,
  members: [1, 2, 3].map((n) => ({ id: id(n), displayName: `M${n}` })),
  categories: ['food'],
  supportedCurrencies: ['TWD', 'USD', 'JPY'],
  currencySettings: {
    default_currency: 'JPY',
    currencies: [
      { code: 'JPY', rate: 0.0067 },
      { code: 'TWD', rate: 0.03 },
    ],
  },
};
const draft = {
  ...newDraft(options, id(1), '2026-10-08'),
  description: 'Dinner',
  amountText: '3000',
};
const preview: ExpensePreview = {
  ledger,
  amount: 20.1,
  originalAmount: 3000,
  currency: 'JPY',
  exchangeRate: 0.0067,
  splits: options.members.map((m) => ({
    userId: m.id,
    displayName: m.displayName,
    shareAmount: 6.7,
  })),
};
const detail = {
  ...preview,
  id: id(10),
  description: 'Dinner',
  category: 'food' as const,
  date: '2026-10-08',
  payerId: id(1),
  payerName: 'M1',
  originalAmount: 3000,
  currency: 'JPY',
  exchangeRate: 0.0067,
};
const opened: ReturnType<typeof memoryDatabase>[] = [];
const dirs: string[] = [];
const open = (file?: string) => {
  const db = memoryDatabase(file);
  opened.push(db);
  return db;
};
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const body = () => ({ ...confirmedFields(draft, options, preview), client_request_id: uuid(1) });
const record = (): PendingExpense => ({
  ...scope,
  tripId,
  clientRequestId: uuid(1),
  payload: body(),
  apiVersion: 2,
  baseCurrency: 'USD',
  moneyScale: 2,
  status: 'unconfirmed',
  createdAt: 1,
  updatedAt: 1,
});

describe('B3 monetary contract and input', () => {
  it('keeps the original JPY amount/rate and backend USD shares', () => {
    expect(previewInputOf(draft, options)).toEqual({
      base_currency: 'USD',
      amount: 3000,
      currency: 'JPY',
      exchange_rate: 0.0067,
      member_ids: [id(1), id(2), id(3)],
    });
    expect(body()).toMatchObject({
      base_currency: 'USD',
      original_amount: 3000,
      exchange_rate: 0.0067,
      splits: [
        { user_id: id(1), share_amount: 6.7 },
        { user_id: id(2), share_amount: 6.7 },
        { user_id: id(3), share_amount: 6.7 },
      ],
    });
    expect(draftRate({ ...draft, ...currencyDefaults(options, 'TWD') })).toBe(0.03);
    expect(draftRate({ ...draft, ...currencyDefaults(options, 'USD') })).toBe(1);
    expect(isTwdQueueDraft({ ...draft, currency: 'TWD', rateText: '1' })).toBe(false);
  });
  it('retains and blocks a legacy or mismatched-unit draft', () => {
    const legacy = { ...draft, ledger: undefined, apiVersion: undefined };
    expect(previewInputOf(legacy, options)).toBeNull();
    expect(validateDraft(legacy, options)).toContainEqual({ field: 'currency', code: 'mismatch' });
    expect(() =>
      confirmedFields(draft, options, { ...preview, ledger: { ...ledger, baseCurrency: 'TWD' } })
    ).toThrow('STALE_PREVIEW');
    expect(() => baseCurrency({ ledger: null })).toThrow('LEDGER_DATA_INVALID');
  });
  it('accepts JPY ledger cents and never uses native zero-decimal formatting', () => {
    const jpy = { ...options, ledger: { ...ledger, baseCurrency: 'JPY' }, currencySettings: null };
    const raw = {
      ...newDraft(jpy, id(1), '2026-10-08'),
      description: 'Cents',
      amountText: '100.01',
    };
    expect(previewInputOf(raw, jpy)).toMatchObject({
      base_currency: 'JPY',
      currency: 'JPY',
      exchange_rate: 1,
      amount: 100.01,
    });
    expect(formatOriginalAmount(0.01, 'JPY')).toBe('JPY · ¥0.01');
    expect(previewInputOf({ ...raw, amountText: '100.001' }, jpy)).toBeNull();
    expect(validateDraft({ ...raw, amountText: '1000000000.01' }, jpy)).toContainEqual({
      field: 'amount',
      code: 'tooLarge',
    });
  });
  it('currency defaults use the base and leave TWD as a genuine foreign currency', () => {
    expect(currencyFields({ ledger, settings: null } as never).defaultCurrency).toBe('USD');
    expect(
      currencySettings(
        {
          defaultCurrency: 'USD',
          rows: [
            { code: 'USD', rate: '1' },
            { code: 'TWD', rate: '0.03' },
          ],
        },
        ['USD', 'TWD'],
        'USD'
      )
    ).toEqual({
      default_currency: null,
      currencies: [
        { code: 'USD', rate: null },
        { code: 'TWD', rate: 0.03 },
      ],
    });
  });
  it('basic edit preserves money; equal edit freezes USD and fresh preview', () => {
    const context = {
      ledger,
      revision: 'a'.repeat(64),
      expense: detail,
      options,
      category: 'food',
      capabilities: { equal: true, recalculate: true, basic: true, delete: true },
    } as never;
    const fields = {
      description: 'Changed',
      category: 'food',
      date: '2026-10-08',
      amountText: '3000',
      currency: 'JPY',
      rateText: '0.0067',
      payerId: id(1),
      memberIds: [id(1), id(2), id(3)],
    };
    expect(editChanges(context, fields, 'basic')).toEqual({
      base_currency: 'USD',
      mode: 'basic',
      changes: { description: 'Changed' },
    });
    expect(editChanges(context, fields, 'equal', preview)).toMatchObject({
      base_currency: 'USD',
      mode: 'equal',
      changes: { currency: 'JPY', original_amount: 3000, exchange_rate: 0.0067 },
    });
    expect(() =>
      editChanges(context, fields, 'equal', {
        ...preview,
        ledger: { ...ledger, baseCurrency: 'TWD' },
      })
    ).toThrow('INVALID_EDIT');
  });
  it('payments use actual ledger cents and require another confirmation after a revision change', async () => {
    const context = {
      ledger,
      members: options.members,
      settlementRevision: 'a'.repeat(64),
    } as never;
    const fields = { fromId: id(2), toId: id(1), amountText: '3.35', note: '' };
    expect(paymentInput(context, fields).amount).toBe(3.35);
    expect(
      (
        await preparePayment(
          async () => context,
          scope.accountId,
          tripId,
          context,
          fields,
          () => {}
        )
      ).body
    ).toMatchObject({ base_currency: 'USD', amount: 3.35 });
    expect(
      (
        await preparePayment(
          async () => ({ ...(context as object), settlementRevision: 'b'.repeat(64) }) as never,
          scope.accountId,
          tripId,
          context,
          fields,
          () => {}
        )
      ).body
    ).toBeNull();
  });
});

describe('B3 transport', () => {
  it('derives v2 from the same validated origin', async () => {
    const fetcher = vi.fn(async (_url: string) => Response.json({ data: options }));
    const api = new ApiClient(scope.environment, fetcher);
    expect(
      await api.request(`/trips/${tripId}/expense-options`, expenseOptionsSchema)
    ).toMatchObject({ ledger });
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://test.invalid/api/v2/trips/${tripId}/expense-options`
    );
    expect(api.environment).toBe(scope.environment);
  });
  it.each([undefined, null, { baseCurrency: 'USD', moneyScale: 0 }])(
    'rejects absent or damaged live units: %j',
    async (unit) => {
      const api = new ApiClient(scope.environment, async () =>
        Response.json({ data: { ...options, ledger: unit } })
      );
      await expect(
        api.request(`/trips/${tripId}/expense-options`, expenseOptionsSchema)
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  );
  it('rejects nested ledger disagreement and never falls back to v1', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          status: 'committed',
          ledger,
          operation: 'expense.delete',
          resourceId: id(10),
          result: {
            tripId,
            expenseId: id(10),
            deleted: true,
            ledger: { baseCurrency: 'TWD', moneyScale: 2 },
          },
        },
      })
    );
    await expect(
      new ApiClient(scope.environment, fetcher).request(
        `/mutation-requests/${uuid(1)}`,
        mutationRequestSchema
      )
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('reads capability without changing persistence scope', async () => {
    const api = new ApiClient(scope.environment, async () =>
      Response.json({
        data: {
          ledgerContractVersion: 2,
          moneyScale: 2,
          supportedBaseCurrencies: ['TWD', 'USD'],
          nonTwdCreationEnabled: false,
        },
      })
    );
    expect(
      (await api.request('/capabilities', ledgerCapabilitiesSchema)).nonTwdCreationEnabled
    ).toBe(false);
  });
});

describe('B5d-1 environment and retired v1 records', () => {
  it('keeps the SQLite scope when the configured address names v2', () => {
    const configured = validateBaseUrl(scope.environment.replace(/v1$/, 'v2'), false);
    expect(new ApiClient(configured).environment).toBe(scope.environment);
  });
  it('retires saved v1 records by their stored version and never relabels them', () => {
    const v1Body = { ...body(), currency: 'TWD' } as Record<string, unknown>;
    delete v1Body.base_currency;
    expect(retiredExpense({ payload: body() })).toBe(false);
    expect(retiredExpense({ payload: v1Body })).toBe(true);
    expect(retiredExpense({ apiVersion: 1, payload: body() })).toBe(true);
    expect(retiredOperation({})).toBe(true);
    expect(retiredOperation({ apiVersion: 1 })).toBe(true);
    expect(retiredOperation({ apiVersion: 2 })).toBe(false);
  });
  it('has no way left to send a request on v1', () => {
    const root = join(process.cwd(), 'src');
    const offenders = readdirSync(root, { recursive: true })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      // The retirement decoder is the only place an unlabelled record is read as v1.
      .filter((file) => file !== 'api/recovery.ts' && !file.startsWith('test/'))
      .filter((file) =>
        /apiVersion\s*\?\?|apiVersion: 1\b|transport\(\s*1|\/v1\//.test(
          readFileSync(join(root, file), 'utf8')
        )
      );
    expect(offenders).toEqual([]);
  });
});

/** The confirmed fields of a frozen body, as the entry receives them before it adds an id. */
const withoutId = (frozen: { client_request_id: string }) => {
  const fields: Partial<typeof frozen> = { ...frozen };
  delete fields.client_request_id;
  return fields as Parameters<ExpenseEntry['submit']>[2];
};
describe('B5d-1 retired v1 operations are never sent, only discarded', () => {
  const v1Body = () => {
    const legacy = { ...body(), currency: 'TWD', original_amount: 20.1, exchange_rate: 1 };
    delete (legacy as { base_currency?: string }).base_currency;
    return legacy;
  };
  const neverCalled = () =>
    vi.fn(async () => {
      throw new Error('a retired operation reached transport');
    });

  it('creates only v2 C requests, at the entry and at the SQLite boundary', async () => {
    const store = await createPendingExpenseStore(open());
    const request = neverCalled();
    const entry = new ExpenseEntry({ store: async () => store, request, newId: () => uuid(1) });
    const fields = withoutId(v1Body());
    expect((await entry.submit(scope, tripId, fields)).kind).toBe('not-sent');
    for (const saved of [
      { ...record(), apiVersion: 1 as const },
      { ...record(), apiVersion: undefined },
      { ...record(), payload: v1Body() },
    ])
      await expect(store.insert(saved)).rejects.toThrow('INVALID_PENDING_LEDGER');
    expect(await store.list(scope)).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('decodes a v1 C row unchanged, and lookup, retry and recovery send nothing', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await insertLegacyPending(db, { ...scope, tripId, payload: v1Body() });
    const raw = await db.getFirstAsync('SELECT * FROM pending_expense');
    const request = neverCalled();
    const entry = new ExpenseEntry({ store: async () => store, request, newId: () => uuid(2) });
    const retired = { kind: 'unconfirmed', clientRequestId: uuid(1), reason: 'retired' };
    expect(await entry.lookup(scope, uuid(1))).toEqual(retired);
    expect(await entry.retry(scope, uuid(1))).toEqual(retired);
    expect(await entry.recover(scope)).toEqual([retired]);
    expect(request).not.toHaveBeenCalled();
    expect(await db.getFirstAsync('SELECT * FROM pending_expense')).toEqual(raw);
    expect(await store.get(scope, uuid(1))).toMatchObject({ apiVersion: 1, payload: v1Body() });
    // It still holds the trip until the user discards it.
    const fields = withoutId(body());
    expect((await entry.submit(scope, tripId, fields)).kind).toBe('blocked');
  });

  it('discards only a v1 C row, with its draft and queue row, and frees the trip', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    const changed = vi.fn();
    const request = vi.fn(
      async (_a: string, _p: string, schema: { parse: (v: unknown) => unknown }) =>
        schema.parse({ status: 'not_found' })
    );
    const entry = new ExpenseEntry({
      store: async () => store,
      request: request as never,
      newId: () => uuid(3),
      onChange: changed,
    });
    await store.insert({ ...record(), tripId: id(8) });
    await expect(entry.abandon(scope, uuid(1))).rejects.toThrow('NOT_RETIRED');
    expect(await store.list(scope, id(8))).toHaveLength(1);

    await store.drafts.start({
      ...scope,
      tripId,
      draftId: uuid(50),
      revision: 1,
      input: draft,
      updatedAt: 1,
    });
    await db.runAsync(
      "UPDATE expense_draft SET status = 'handed-off', client_request_id = ? WHERE trip_id = ?",
      uuid(7),
      tripId
    );
    await insertLegacyPending(db, {
      ...scope,
      tripId,
      payload: { ...v1Body(), client_request_id: uuid(7) },
    });
    await db.runAsync(
      "INSERT INTO expense_queue (environment, account_id, client_request_id, trip_id, input, roster, status, reason, next_at, created_at, api_version) VALUES (?, ?, ?, ?, '{}', '[]', 'prepared', NULL, 0, 1, 1)",
      scope.environment,
      scope.accountId,
      uuid(7),
      tripId
    );
    await entry.abandon(scope, uuid(7));
    expect(await store.list(scope, tripId)).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM expense_queue')).toEqual([]);
    expect(
      await db.getFirstAsync('SELECT status, input FROM expense_draft WHERE trip_id = ?', tripId)
    ).toEqual({ status: 'discarded', input: '{}' });
    expect(changed).toHaveBeenCalledWith(scope, tripId);
    await entry.abandon(scope, uuid(7)); // already gone: nothing to do
    expect(request).not.toHaveBeenCalled();
    const fields = withoutId(body());
    request.mockImplementation(async (_a, path, schema) =>
      schema.parse(path.endsWith('/expenses') ? detail : { status: 'not_found' })
    );
    expect((await entry.submit(scope, tripId, fields)).kind).toBe('saved');
  });

  it('creates only v2 E operations, never sends a v1 one, and discards only pending v1', async () => {
    const db = open();
    const store = await createMutationStore(db);
    const request = neverCalled();
    const engine = new TripEntry({
      store: async () => store,
      request,
      newId: () => uuid(5),
      active: () => true,
    });
    const v1 = {
      ...scope,
      clientRequestId: uuid(5),
      operation: 'trip.join' as const,
      payload: {
        operation: 'trip.join' as const,
        body: { client_request_id: uuid(5), invite_code: 'ABCDEF' },
      },
      result: null,
      status: 'pending' as const,
      conflict: false,
      createdAt: 1,
    };
    await expect(store.insert(v1)).rejects.toThrow('INVALID_MUTATION_LEDGER');
    await expect(store.insert({ ...v1, apiVersion: 1 })).rejects.toThrow('INVALID_MUTATION_LEDGER');
    // What an older release wrote: the row is v1.
    await store.insert({ ...v1, apiVersion: 2 });
    await db.runAsync('UPDATE pending_mutation SET api_version = 1');
    const raw = await db.getFirstAsync('SELECT * FROM pending_mutation');
    expect(await engine.lookup(scope, uuid(5))).toEqual({ kind: 'retired' });
    expect(await engine.retry(scope, uuid(5))).toEqual({ kind: 'retired' });
    await engine.recover(scope);
    expect(request).not.toHaveBeenCalled();
    expect(await db.getFirstAsync('SELECT * FROM pending_mutation')).toEqual(raw);
    // A pending v2 operation and a completed v1 one are never discarded this way.
    await store.insert({
      ...v1,
      apiVersion: 2,
      clientRequestId: uuid(6),
      operation: 'trip.create',
      payload: {
        operation: 'trip.create',
        body: {
          client_request_id: uuid(6),
          name: 'T',
          description: '',
          start_date: null,
          end_date: null,
          base_currency: 'TWD',
        },
      },
    });
    await db.runAsync(
      "INSERT INTO pending_mutation (environment, account_id, client_request_id, operation, payload, trip_id, status, conflict, created_at, api_version, base_currency, money_scale, result) VALUES (?, ?, ?, 'trip.create', NULL, NULL, 'completed', 0, 1, 1, 'TWD', 2, ?)",
      scope.environment,
      scope.accountId,
      uuid(4),
      JSON.stringify({
        status: 'committed',
        operation: 'trip.create',
        resourceId: tripId,
        result: { tripId },
      })
    );
    for (const key of [uuid(4), uuid(6)]) await engine.abandon(scope, key);
    expect((await store.list(scope)).map((r) => r.clientRequestId).sort()).toEqual([
      uuid(4),
      uuid(5),
      uuid(6),
    ]);
    await engine.abandon(scope, uuid(5));
    expect((await store.list(scope)).map((r) => r.clientRequestId).sort()).toEqual([
      uuid(4),
      uuid(6),
    ]);
  });
});

describe('B3 SQLite and frozen recovery', () => {
  it('reopens v2 pending, catalog and draft without changing original unit/body', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tb-b3-'));
    dirs.push(dir);
    const file = join(dir, 'expense.db');
    let db = open(file);
    const store = await createPendingExpenseStore(db);
    await store.drafts.start({
      ...scope,
      tripId,
      draftId: uuid(8),
      revision: 0,
      input: draft,
      updatedAt: 1,
    });
    await (await createDraftTripStore(db)).rememberOptions(scope, tripId, options, 1);
    await store.insert(record());
    const json = (await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM pending_expense'
    ))!.payload;
    db.close();
    opened.splice(opened.indexOf(db), 1);
    db = open(file);
    const restarted = await createPendingExpenseStore(db);
    expect(await restarted.get(scope, uuid(1))).toEqual(record());
    expect((await restarted.drafts.load(scope, tripId))!.input).toEqual(draft);
    expect((await (await createDraftTripStore(db)).get(scope, tripId))!.options?.ledger).toEqual(
      ledger
    );
    expect(
      (await db.getFirstAsync<{ payload: string }>('SELECT payload FROM pending_expense'))!.payload
    ).toBe(json);
    expect(await restarted.get({ ...scope, accountId: id(2) }, uuid(1))).toBeNull();
    const queue = await createExpenseQueueStore(db);
    await expect(
      queue.enqueue(
        { ...scope, tripId, draftId: uuid(8), revision: 0, input: draft, updatedAt: 1 },
        options,
        uuid(9)
      )
    ).rejects.toThrow('UNSUPPORTED_QUEUE_CURRENCY');
  });
  it('upgrades schema 8 atomically without rewriting frozen C/E payloads or account 429', async () => {
    const db = open();
    let store = await createPendingExpenseStore(db);
    const mutations = await createMutationStore(db);
    const legacy = {
      ...record(),
      apiVersion: 1 as const,
      baseCurrency: 'TWD',
      payload: { ...body(), currency: 'TWD', original_amount: 20.1, exchange_rate: 1 },
    };
    delete (legacy.payload as { base_currency?: string }).base_currency;
    await insertLegacyPending(db, legacy);
    await mutations.insert({
      ...scope,
      apiVersion: 2,
      clientRequestId: uuid(2),
      operation: 'trip.join',
      payload: {
        operation: 'trip.join',
        body: { client_request_id: uuid(2), invite_code: 'ABCDEF' },
      },
      result: null,
      status: 'pending',
      conflict: false,
      createdAt: 1,
    });
    await mutations.pause(scope, Date.now() + 120000);
    const before = await db.getFirstAsync('SELECT payload FROM pending_expense');
    const eBefore = await db.getFirstAsync('SELECT payload FROM pending_mutation');
    await db.execAsync(
      'ALTER TABLE pending_expense DROP COLUMN api_version; ALTER TABLE pending_expense DROP COLUMN base_currency; ALTER TABLE pending_expense DROP COLUMN money_scale; ALTER TABLE pending_mutation DROP COLUMN api_version; ALTER TABLE pending_mutation DROP COLUMN base_currency; ALTER TABLE pending_mutation DROP COLUMN money_scale; ALTER TABLE expense_queue DROP COLUMN api_version; PRAGMA user_version=8;'
    );
    const broken = {
      ...db,
      execAsync: async (sql: string) => {
        if (sql.includes('ALTER TABLE pending_mutation ADD')) throw new Error('disk full');
        await db.execAsync(sql);
      },
    };
    await expect(createPendingExpenseStore(broken)).rejects.toThrow('disk full');
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 8 });
    expect(await db.getFirstAsync('SELECT payload FROM pending_expense')).toEqual(before);
    store = await createPendingExpenseStore(db);
    expect((await store.get(scope, uuid(1)))?.apiVersion).toBe(1);
    expect(await db.getFirstAsync('SELECT payload FROM pending_expense')).toEqual(before);
    expect(await db.getFirstAsync('SELECT payload FROM pending_mutation')).toEqual(eBefore);
    expect(await (await createMutationStore(db)).retryAt(scope)).toBeGreaterThan(
      Date.now() + 110000
    );
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 10 });
  });
  it('C restores the original v2 UUID and endpoint after a lost answer', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.insert(record());
    const request = vi.fn(async (_account, path, schema) => {
      expect(path).toContain(uuid(1));
      return schema.parse({ status: 'committed', expense: detail });
    });
    const entry = new ExpenseEntry({ store: async () => store, request, newId: () => uuid(99) });
    expect((await entry.lookup(scope, uuid(1))).kind).toBe('saved');
    expect(request).toHaveBeenCalledOnce();
    expect(await store.list(scope)).toEqual([]);
  });
  it('keeps v2 E body/UUID after network loss and queries the same-version receipt on restart', async () => {
    const db = open();
    const store = await createMutationStore(db);
    const request = vi.fn(async (_a, _p, _s, _o) => {
      throw new ApiError('NETWORK');
    });
    const deps = {
      store: async () => store,
      request,
      newId: () => uuid(4),
      active: () => true,
    };
    expect(
      (
        await new TripEntry(deps).confirm(scope, {
          operation: 'expense.delete',
          tripId,
          expenseId: id(10),
          body: { base_currency: 'USD', expected_revision: 'a'.repeat(64) },
        })
      ).kind
    ).toBe('pending');
    const stored = (await store.list(scope))[0];
    expect(stored).toMatchObject({ apiVersion: 2, baseCurrency: 'USD', moneyScale: 2 });
    const raw = await db.getFirstAsync('SELECT payload FROM pending_mutation');
    await new TripEntry(deps).lookup(scope, uuid(4));
    expect(request.mock.calls.at(-1)?.[1]).toBe(`/mutation-requests/${uuid(4)}`);
    expect(await db.getFirstAsync('SELECT payload FROM pending_mutation')).toEqual(raw);
    expect((await store.get(scope, uuid(4)))?.clientRequestId).toBe(uuid(4));
  });
  it('does not release an unknown write when the receipt unit differs', async () => {
    const store = await createPendingExpenseStore(open());
    await store.insert(record());
    const entry = new ExpenseEntry({
      store: async () => store,
      newId: () => uuid(8),
      request: async () =>
        ({
          status: 'committed',
          expense: { ...detail, ledger: { ...ledger, baseCurrency: 'TWD' } },
        }) as never,
    });
    expect((await entry.lookup(scope, uuid(1))).kind).toBe('unconfirmed');
    expect(await store.list(scope)).toHaveLength(1);
  });
});

it('a restarted v2 join discovers the receipt unit without inventing TWD', async () => {
  const db = open();
  const store = await createMutationStore(db);
  const lost = new TripEntry({
    store: async () => store,
    newId: () => uuid(7),
    active: () => true,
    request: async () => {
      throw new ApiError('NETWORK');
    },
  });
  await lost.confirm(scope, { operation: 'trip.join', body: { invite_code: 'ABCDEF' } });
  expect((await store.get(scope, uuid(7)))?.baseCurrency).toBeUndefined();
  const request = new TripEntry({
    store: async () => store,
    newId: () => uuid(8),
    active: () => true,
    request: async (_a, _p, schema) =>
      schema.parse({
        status: 'committed',
        operation: 'trip.join',
        resourceId: tripId,
        ledger,
        result: { tripId, ledger },
      }),
  });
  expect((await request.lookup(scope, uuid(7))).kind).toBe('completed');
  expect((await store.get(scope, uuid(7)))?.status).toBe('completed');
});

it('a lost v2 C response recovers once with the original base and UUID', async () => {
  const store = await createPendingExpenseStore(open());
  let committed = false;
  let posts = 0;
  const seen: unknown[] = [];
  const entry = new ExpenseEntry({
    store: async () => store,
    newId: () => uuid(1),
    request: async (_a, path, schema, options) => {
      if (options?.method === 'POST') {
        posts++;
        seen.push(options.body);
        committed = true;
        throw new ApiError('NETWORK');
      }
      expect(path).toContain(uuid(1));
      return schema.parse(
        committed ? { status: 'committed', expense: detail } : { status: 'not_found' }
      );
    },
  });
  expect((await entry.submit(scope, tripId, confirmedFields(draft, options, preview))).kind).toBe(
    'saved'
  );
  expect(posts).toBe(1);
  expect(seen).toEqual([body()]);
  expect((await entry.lookup(scope, uuid(1))).kind).toBe('gone');
  expect(await store.list(scope)).toEqual([]);
});

it('a v2 generic 400 cannot erase an earlier ambiguous write', async () => {
  const store = await createPendingExpenseStore(open());
  await store.insert(record());
  const entry = new ExpenseEntry({
    store: async () => store,
    newId: () => uuid(8),
    request: async (_a, _p, schema, opts) => {
      if (opts?.method === 'POST') throw new ApiError('VALIDATION_ERROR', 400);
      return schema.parse({ status: 'not_found' });
    },
  });
  expect((await entry.retry(scope, uuid(1))).kind).toBe('unconfirmed');
  expect((await store.get(scope, uuid(1)))?.payload).toEqual(body());
});

it.each([false, true])(
  'a v2 validation receipt releases a frozen draft after restart (lost response=%s)',
  async (lost) => {
    const dir = mkdtempSync(join(tmpdir(), 'tb-v2-refusal-'));
    dirs.push(dir);
    const file = join(dir, 'draft.sqlite');
    let db = open(file);
    let store = await createPendingExpenseStore(db);
    const raw = { ...draft, amountText: '03000.00', rateText: '0.006700' };
    const savedDraft = {
      ...scope,
      tripId,
      draftId: uuid(100),
      revision: 1,
      input: raw,
      updatedAt: 1,
    };
    await store.drafts.start(savedDraft);
    let refused = false,
      posts = 0,
      ids = 1;
    const makeEntry = () =>
      new ExpenseEntry({
        store: async () => store,
        newId: () => uuid(ids++),
        request: async (_a, path, schema, opts) => {
          if (opts?.method === 'POST') {
            posts++;
            if (posts === 1) {
              expect(opts.body).toEqual(body());
              refused = true;
              throw new ApiError(lost ? 'NETWORK' : 'VALIDATION_ERROR', lost ? undefined : 400);
            }
            return schema.parse(detail);
          }
          // Failure of the first follow-up read forces recovery through a reopened SQLite database.
          if (lost && refused && posts === 1 && path.includes(uuid(1)))
            throw new ApiError('NETWORK');
          return schema.parse(
            refused && posts === 1 && path.includes(uuid(1))
              ? { status: 'rejected', code: 'VALIDATION_ERROR', ledger }
              : { status: 'not_found' }
          );
        },
      });
    const first = await makeEntry().submit(
      scope,
      tripId,
      confirmedFields(draft, options, preview),
      savedDraft
    );
    expect(first.kind).toBe(lost ? 'unconfirmed' : 'rejected');
    opened.splice(opened.indexOf(db), 1);
    db.close();
    db = open(file);
    store = await createPendingExpenseStore(db);
    if (lost) {
      const recovery = new ExpenseEntry({
        store: async () => store,
        newId: () => uuid(99),
        request: async (_a, path, schema, opts) => {
          expect(opts?.method).not.toBe('POST');
          expect(path).toContain(uuid(1));
          return schema.parse({ status: 'rejected', code: 'VALIDATION_ERROR', ledger });
        },
      });
      expect((await recovery.recover(scope))[0]).toMatchObject({
        kind: 'rejected',
        error: { code: 'VALIDATION_ERROR' },
      });
    }
    expect(await store.list(scope)).toEqual([]);
    const restored = await store.drafts.load(scope, tripId);
    expect(restored).toEqual({ ...savedDraft, revision: 2 });
    expect(
      (await makeEntry().submit(scope, tripId, confirmedFields(draft, options, preview), restored!))
        .kind
    ).toBe('saved');
    expect(posts).toBe(2);
    expect(await store.list(scope)).toEqual([]);
  }
);
