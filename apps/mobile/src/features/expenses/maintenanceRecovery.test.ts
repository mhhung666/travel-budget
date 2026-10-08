import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { TripEntry } from '@/features/tripEntry/engine';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore } from '@/storage/mutations';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { createExpenseQueueStore } from '@/storage/expenseQueue';
const scope = { environment: 'https://example/api/v1', accountId: '111111111111111111111111' };
const tripId = '222222222222222222222222',
  expenseId = '333333333333333333333333',
  otherTrip = '444444444444444444444444';
const key = '11111111-1111-4111-8111-111111111111',
  cKey = '22222222-2222-4222-8222-222222222222';
const payload = {
  operation: 'expense.update' as const,
  tripId,
  expenseId,
  body: {
    mode: 'basic' as const,
    expected_revision: 'a'.repeat(64),
    changes: { description: 'edited' },
  },
};
const result = {
  status: 'committed' as const,
  operation: 'expense.update' as const,
  resourceId: expenseId,
  result: { tripId, expenseId, revision: 'b'.repeat(64) },
};
const cFields = {
  client_request_id: cKey,
  payer_id: scope.accountId,
  original_amount: 100,
  currency: 'TWD' as const,
  exchange_rate: 1 as const,
  description: 'new',
  category: 'food' as const,
  date: '2026-10-06',
  splits: [{ user_id: scope.accountId, share_amount: 100 }],
};
let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-e3-'));
  const path = join(dir, 'pending.db');
  let db = memoryDatabase(path);
  let store = await createMutationStore(db);
  let now = 100000;
  let version = 0;
  const receipts = new Map<string, typeof result>();
  const request = vi.fn(
    async (
      _user: string,
      path: string,
      _schema: unknown,
      options?: { method?: string; body?: unknown; beforeSend?: () => void }
    ) => {
      options?.beforeSend?.();
      if (options?.method) {
        receipts.set(key, result);
        return result.result;
      }
      return receipts.get(key) ?? { status: 'not_found' };
    }
  );
  const engine = () =>
    new TripEntry({
      store: async () => store,
      request: request as never,
      newId: () => key,
      active: () => true,
      now: () => now,
      guard: () => {
        const v = version;
        return (trip) => {
          if (trip === tripId && v !== version) throw new ApiError('CANCELLED');
        };
      },
    });
  cleanup.push(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    engine,
    request,
    receipts,
    get store() {
      return store;
    },
    get db() {
      return db;
    },
    set now(v: number) {
      now = v;
    },
    set version(v: number) {
      version = v;
    },
    async restart() {
      db.close();
      db = memoryDatabase(path);
      store = await createMutationStore(db);
    },
  };
}
it('lost PATCH response and reopen recover without writing again; result targets trip and expense separately', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async () => {
    h.receipts.set(key, result);
    throw new ApiError('NETWORK');
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  await h.restart();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'PATCH')).toHaveLength(1);
  expect((await h.store.list(scope))[0]).toMatchObject({
    tripId,
    status: 'completed',
    payload: null,
    result,
  });
});
it('C and E confirmation race allows only one durable trip operation; another trip remains usable', async () => {
  const h = await fixture();
  const c = await createPendingExpenseStore(h.db);
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  const record = {
    ...scope,
    tripId,
    clientRequestId: cKey,
    payload: cFields,
    status: 'sending' as const,
    createdAt: 1,
    updatedAt: 1,
  };
  const results = await Promise.allSettled([h.engine().confirm(scope, payload), c.insert(record)]);
  const ePending = (await h.store.list(scope)).filter((r) => r.status === 'pending').length;
  const cPending = (await c.list(scope, tripId)).length;
  expect(ePending + cPending).toBe(1);
  expect(results).toHaveLength(2);
  await c.insert({
    ...record,
    tripId: otherTrip,
    clientRequestId: '33333333-3333-4333-8333-333333333333',
    payload: { ...cFields, client_request_id: '33333333-3333-4333-8333-333333333333' },
  });
  expect(await c.list(scope, otherTrip)).toHaveLength(1);
});
it('E pending blocks D preparation while queued input and other trips are retained', async () => {
  const h = await fixture();
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  const queue = await createExpenseQueueStore(h.db);
  const draft = {
    ...scope,
    tripId,
    draftId: cKey,
    revision: 1,
    input: {
      description: 'queued',
      amountText: '100',
      category: 'food' as const,
      date: '2026-10-06',
      payerId: scope.accountId,
      memberIds: [scope.accountId],
    },
    updatedAt: 1,
    status: 'editing' as const,
  };
  const c = await createPendingExpenseStore(h.db);
  await c.drafts.start(draft);
  await queue.enqueue(
    draft,
    { members: [{ id: scope.accountId, displayName: 'Same' }], categories: ['food'] },
    cKey
  );
  const item = (await queue.list(scope))[0];
  expect(await queue.prepare(item, { ...cFields, base_currency: 'TWD' })).toBe(false);
  expect((await queue.list(scope))[0].status).toBe('queued');
  expect(await c.list(scope)).toEqual([]);
});
it('C pending blocks a new E edit without HTTP, and a different trip can confirm', async () => {
  const h = await fixture();
  const c = await createPendingExpenseStore(h.db);
  await c.insert({
    ...scope,
    tripId,
    clientRequestId: cKey,
    payload: cFields,
    status: 'sending',
    createdAt: 1,
    updatedAt: 1,
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
  expect(h.request).not.toHaveBeenCalled();
  expect((await h.engine().confirm(scope, { ...payload, tripId: otherTrip })).kind).toBe(
    'completed'
  );
});
it('SQLite failure sends nothing; a crash after persistence keeps exact original body and UUID', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  await h.restart();
  await h.engine().retry(scope, key);
  const patch = h.request.mock.calls.findLast((c) => c[3]?.method === 'PATCH');
  expect(patch?.[3]?.body).toEqual({ ...payload.body, client_request_id: key });
});
it('terminal conflict releases trip lock; 429 deadline survives restart and lookup rejection does not erase conflict', async () => {
  const h = await fixture();
  h.request
    .mockRejectedValueOnce(new ApiError('RESOURCE_CHANGED', 409))
    .mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.now = 131000;
  const calls = h.request.mock.calls.length;
  await h.engine().retry(scope, key);
  expect(h.request).toHaveBeenCalledTimes(calls);
  expect(await h.store.retryAt(scope)).toBe(220000);
  h.now = 220000;
  h.request.mockResolvedValueOnce({
    status: 'rejected',
    operation: 'expense.update',
    code: 'RESOURCE_CHANGED',
    tripId,
  } as never);
  await h.engine().lookup(scope, key);
  expect((await h.store.list(scope))[0].payload).toMatchObject({
    body: { changes: payload.body.changes },
  });
  const c = await createPendingExpenseStore(h.db);
  await c.insert({
    ...scope,
    tripId,
    clientRequestId: cKey,
    payload: cFields,
    status: 'sending',
    createdAt: 1,
    updatedAt: 1,
  });
  expect(await c.list(scope, tripId)).toHaveLength(1);
});
it('revocation during SQLite/refresh wait blocks PATCH and preserves pending for original lookup', async () => {
  const h = await fixture();
  const insert = h.store.insert;
  vi.spyOn(h.store, 'insert').mockImplementation(async (r) => {
    const accepted = await insert(r);
    h.version = 1;
    return accepted;
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  expect((await h.store.list(scope))[0].status).toBe('pending');
});
it('an ordinary missing resource does not resolve an ambiguous write; completed refresh failure remains success', async () => {
  const h = await fixture();
  h.request
    .mockRejectedValueOnce(new ApiError('NOT_FOUND', 404))
    .mockResolvedValueOnce({ status: 'not_found' } as never);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect((await h.store.list(scope))[0].status).toBe('pending');
  const engine = new TripEntry({
    store: async () => h.store,
    request: async () => result as never,
    newId: () => key,
    active: () => true,
    committed: async () => {
      throw new Error('read failed');
    },
  });
  expect(await engine.lookup(scope, key)).toMatchObject({ kind: 'completed', refreshed: false });
});
it('schema 7 upgrade preserves C/D, E1 rows and waits; failed ALTER rolls back', async () => {
  const h = await fixture();
  const c = await createPendingExpenseStore(h.db);
  await c.pause!(scope, key, 'busy', 220000);
  await h.db.execAsync(
    'DROP INDEX pending_mutation_by_trip; ALTER TABLE pending_mutation DROP COLUMN trip_id; ALTER TABLE pending_expense DROP COLUMN api_version; ALTER TABLE pending_expense DROP COLUMN base_currency; ALTER TABLE pending_expense DROP COLUMN money_scale; ALTER TABLE pending_mutation DROP COLUMN api_version; ALTER TABLE pending_mutation DROP COLUMN base_currency; ALTER TABLE pending_mutation DROP COLUMN money_scale; ALTER TABLE expense_queue DROP COLUMN api_version; PRAGMA user_version=7;'
  );
  const original = h.db.execAsync;
  const broken = {
    ...h.db,
    execAsync: async (sql: string) => {
      await original(sql);
      if (sql.includes('ADD COLUMN trip_id')) throw new Error('disk full');
    },
  };
  await expect(createMutationStore(broken)).rejects.toThrow('disk full');
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 7 });
  await createMutationStore(h.db);
  expect(await h.store.retryAt(scope)).toBe(220000);
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 10 });
});

it('a rejected operation keeps only its own input across reopen for explicit fresh confirmation', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('RESOURCE_CHANGED', 409)).mockResolvedValueOnce({
    status: 'rejected',
    operation: 'expense.update',
    tripId,
    code: 'RESOURCE_CHANGED',
  } as never);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('completed');
  await h.restart();
  const row = await h.store.get(scope, key);
  expect(row?.status).toBe('completed');
  expect(row?.payload).toMatchObject({
    ...payload,
    body: { ...payload.body, client_request_id: key },
  });
  expect(await h.store.get({ ...scope, accountId: tripId }, key)).toBeNull();
});

const foreignPayload = {
  ...payload,
  body: {
    mode: 'equal' as const,
    expected_revision: 'a'.repeat(64),
    changes: {
      original_amount: 100.01,
      currency: 'JPY',
      exchange_rate: 0.2156789012345,
      payer_id: scope.accountId,
      splits: [{ user_id: scope.accountId, share_amount: 21.57 }],
    },
  },
};
it('foreign lost PATCH reply survives reopen, isolates account/environment and only recovers one receipt', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async () => {
    h.receipts.set(key, result);
    throw new ApiError('NETWORK');
  });
  expect((await h.engine().confirm(scope, foreignPayload)).kind).toBe('pending');
  await h.restart();
  expect((await h.store.get(scope, key))?.payload).toEqual({
    ...foreignPayload,
    body: { ...foreignPayload.body, client_request_id: key },
  });
  expect(await h.store.get({ ...scope, accountId: tripId }, key)).toBeNull();
  expect(await h.store.get({ ...scope, environment: 'https://other/api/v1' }, key)).toBeNull();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'PATCH')).toHaveLength(1);
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
it('foreign storage failure never sends; missing receipt replays exact original UUID/rate after restart', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, foreignPayload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, foreignPayload);
  await h.restart();
  await h.engine().retry(scope, key);
  const patches = h.request.mock.calls.filter((c) => c[3]?.method === 'PATCH');
  expect(patches).toHaveLength(2);
  expect(patches[0][3]?.body).toEqual(patches[1][3]?.body);
  expect(patches[1][3]?.body).toEqual({ ...foreignPayload.body, client_request_id: key });
});
it('foreign 429 survives restart and revocation blocks replay while retaining the same frozen operation', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  expect((await h.engine().confirm(scope, foreignPayload)).kind).toBe('pending');
  await h.restart();
  h.now = 131000;
  const calls = h.request.mock.calls.length;
  await h.engine().retry(scope, key);
  expect(h.request).toHaveBeenCalledTimes(calls);
  expect((await h.store.get(scope, key))?.payload).toMatchObject({ body: foreignPayload.body });
  h.now = 220000;
  h.request.mockRejectedValue(new ApiError('NOT_FOUND', 404));
  await h.engine().retry(scope, key);
  expect((await h.store.get(scope, key))?.status).toBe('pending');
  expect((await h.store.get(scope, key))?.payload).toMatchObject({ body: foreignPayload.body });
});
