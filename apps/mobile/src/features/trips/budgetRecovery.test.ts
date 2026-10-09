import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { TripEntry } from '@/features/tripEntry/engine';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore } from '@/storage/mutations';
const scope = { environment: 'https://example/api/v1', accountId: '111111111111111111111111' };
const tripId = '222222222222222222222222';
const key = '11111111-1111-4111-8111-111111111111';
const payload = {
  operation: 'budget.set' as const,
  tripId,
  body: {
    base_currency: 'USD',
    expected_revision: 'a'.repeat(64),
    total: 100.01,
    categories: [{ category: 'food' as const, amount: 50 }],
  },
};
const ledger = { baseCurrency: 'USD', moneyScale: 2 as const };
const result = {
  status: 'committed' as const,
  operation: 'budget.set' as const,
  resourceId: tripId,
  ledger,
  result: { tripId, updated: true as const, ledger },
};
let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-budget-'));
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
it('lost POST response survives SQLite reopen and receipt recovery never resends', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async () => {
    h.receipts.set(key, result);
    throw new ApiError('NETWORK');
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request.mock.calls[0][1]).toBe(`/trips/${tripId}/budget`);
  await h.restart();
  expect((await h.store.get(scope, key))?.payload).toEqual({
    ...payload,
    body: { ...payload.body, client_request_id: key },
  });
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method)).toHaveLength(1);
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
it('disk failure prevents writing; unknown receipt retries exact frozen body and UUID, with scope isolation', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  await h.restart();
  expect(await h.store.get({ ...scope, accountId: tripId }, key)).toBeNull();
  expect(await h.store.get({ ...scope, environment: 'https://other/api/v2' }, key)).toBeNull();
  expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
  await h.engine().retry(scope, key);
  const writes = h.request.mock.calls.filter((c) => c[3]?.method);
  expect(writes).toHaveLength(2);
  expect(writes[0][3]?.body).toEqual(writes[1][3]?.body);
});
it('cross-trip 429 deadline survives restart and ends at the original time, without extending on interception', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.now = 131000;
  const calls = h.request.mock.calls.length;
  expect((await h.engine().confirm(scope, { ...payload, tripId: '4'.repeat(24) })).kind).toBe(
    'not-sent'
  );
  await h.engine().retry(scope, key);
  expect(h.request).toHaveBeenCalledTimes(calls);
  expect(await h.store.retryAt(scope)).toBe(220000);
  h.now = 220000;
  await h.engine().retry(scope, key);
  expect((await h.store.get(scope, key))?.status).toBe('completed');
});
it('terminal conflict retains rejected budget for explicit new review after restart', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('RESOURCE_CHANGED', 409)).mockResolvedValueOnce({
    status: 'rejected',
    operation: 'budget.set',
    tripId,
    code: 'RESOURCE_CHANGED',
    ledger,
  } as never);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('completed');
  await h.restart();
  expect((await h.store.get(scope, key))?.payload).toEqual({
    ...payload,
    body: { ...payload.body, client_request_id: key },
  });
  const calls = h.request.mock.calls.length;
  await h.engine().recover(scope);
  expect(h.request).toHaveBeenCalledTimes(calls);
});
it('intervening revocation while awaiting SQLite blocks the write and preserves recovery', async () => {
  const h = await fixture();
  const original = h.store.insert;
  vi.spyOn(h.store, 'insert').mockImplementationOnce(async (record) => {
    const saved = await original(record);
    h.version = 1;
    return saved;
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  expect((await h.store.get(scope, key))?.payload?.body).toEqual({
    ...payload.body,
    client_request_id: key,
  });
});
