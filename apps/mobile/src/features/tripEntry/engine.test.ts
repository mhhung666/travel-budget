import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { memoryDatabase } from '@/test/sqlite';
import { createMutationStore } from '@/storage/mutations';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { TripEntry } from './engine';
const scope = { environment: 'https://example/api/v1', accountId: '111111111111111111111111' };
const key = '11111111-1111-4111-8111-111111111111';
const tripId = '222222222222222222222222';
const payload = {
  operation: 'trip.create' as const,
  body: { name: 'Trip', description: '', start_date: null, end_date: null, base_currency: 'TWD' },
};
const ledger = { baseCurrency: 'TWD', moneyScale: 2 as const };
const result = {
  status: 'committed' as const,
  operation: 'trip.create' as const,
  resourceId: tripId,
  ledger,
  result: { tripId, ledger },
};
let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});
async function fixture(baseCurrency = 'TWD') {
  const ledger = { baseCurrency, moneyScale: 2 as const };
  const committed = { ...result, ledger, result: { tripId, ledger } };
  const dir = mkdtempSync(join(tmpdir(), 'tb-e1-'));
  const path = join(dir, 'pending.db');
  let db = memoryDatabase(path);
  let store = await createMutationStore(db);
  let now = 100000;
  let active = true;
  let version = 0;
  const receipts = new Map<string, typeof result>();
  let posts = 0;
  const request = vi.fn(
    async (
      _user: string,
      path: string,
      _schema: unknown,
      options?: { method?: string; body?: unknown; beforeSend?: () => void }
    ) => {
      options?.beforeSend?.();
      if (options?.method === 'POST') {
        posts++;
        receipts.set(key, committed);
        return committed.result;
      }
      return receipts.get(key) ?? { status: 'not_found' };
    }
  );
  const engine = () =>
    new TripEntry({
      store: async () => store,
      request: request as never,
      newId: () => key,
      now: () => now,
      active: () => active,
      guard: () => {
        const captured = version;
        return () => {
          if (captured !== version) throw new ApiError('CANCELLED');
        };
      },
    });
  cleanup.push(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    engine,
    committed,
    request,
    receipts,
    get posts() {
      return posts;
    },
    get store() {
      return store;
    },
    get db() {
      return db;
    },
    set now(v: number) {
      now = v;
    },
    set active(v: boolean) {
      active = v;
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
it('persists before POST and retains a minimal completed result without sensitive payload', async () => {
  const h = await fixture();
  let saw = false;
  h.request.mockImplementationOnce(async () => {
    saw = (await h.store.list(scope))[0].status === 'pending';
    return { tripId, ledger };
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('completed');
  expect(saw).toBe(true);
  expect((await h.store.list(scope))[0]).toMatchObject({
    payload: null,
    result,
    status: 'completed',
  });
});
it('lost response, database reopen and automatic lookup produce one trip without another POST', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async () => {
    h.receipts.set(key, result);
    throw new ApiError('NETWORK');
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  await h.restart();
  await h.engine().recover(scope);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'POST')).toHaveLength(1);
  expect((await h.store.list(scope))[0].result).toEqual(result);
});
it('crash before POST is query-only on restart, explicit retry uses the frozen key and body', async () => {
  const h = await fixture();
  h.active = false;
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  h.active = true;
  await h.store.insert({
    ...scope,
    clientRequestId: key,
    operation: 'trip.create',
    payload: { ...payload, body: { ...payload.body, client_request_id: key } },
    result: null,
    status: 'pending',
    conflict: false,
    apiVersion: 2,
    createdAt: 1,
  });
  await h.restart();
  await h.engine().recover(scope);
  expect(h.posts).toBe(0);
  await h.engine().retry(scope, key);
  expect(h.posts).toBe(1);
  expect(h.request.mock.calls.at(-1)?.[3]?.body).toEqual({
    ...payload.body,
    client_request_id: key,
  });
});
it('a storage failure sends no HTTP', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'insert').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
});
it('double confirm and a newly mounted engine cannot replace an unresolved operation', async () => {
  const h = await fixture();
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  const engine = h.engine();
  const first = engine.confirm(scope, payload);
  expect((await engine.confirm(scope, payload)).kind).toBe('blocked');
  await first;
  expect((await h.engine().confirm(scope, payload)).kind).toBe('blocked');
  expect(h.request).toHaveBeenCalledTimes(1);
});
it('accounts and environments cannot see or send each other’s operations', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  expect(await h.engine().list({ ...scope, accountId: tripId })).toEqual([]);
  expect(await h.engine().list({ ...scope, environment: 'https://other/api/v1' })).toEqual([]);
});
it('sign-in changes during a SQLite wait block POST even after A→B→A', async () => {
  const h = await fixture();
  const insert = h.store.insert;
  vi.spyOn(h.store, 'insert').mockImplementation(async (record) => {
    const saved = await insert(record);
    h.version = 2;
    return saved;
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(h.request).not.toHaveBeenCalled();
  expect(await h.store.list(scope)).toHaveLength(1);
});
it('late success after loss of eligibility keeps the original pending record', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async () => {
    h.active = false;
    return { tripId, ledger };
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect((await h.store.list(scope))[0].status).toBe('pending');
});
it('409 is durable across failed queries and prevents original POST on restart', async () => {
  const h = await fixture();
  h.request
    .mockRejectedValueOnce(new ApiError('IDEMPOTENCY_CONFLICT', 409))
    .mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  await h.engine().confirm(scope, payload);
  await h.restart();
  expect((await h.store.list(scope))[0].conflict).toBe(true);
  h.request.mockImplementation(async () => ({ status: 'not_found' }) as never);
  await h.engine().retry(scope, key);
  expect(h.request.mock.calls.filter((c) => c[3]?.method === 'POST')).toHaveLength(1);
});
it('terminal rejected receipt clears invite payload, an ordinary 404 cannot clear it', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('INVITATION_INVALID', 404)).mockResolvedValueOnce({
    status: 'rejected',
    operation: 'trip.join',
    code: 'INVITATION_INVALID',
  } as never);
  expect(
    (await h.engine().confirm(scope, { operation: 'trip.join', body: { invite_code: 'abc123' } }))
      .kind
  ).toBe('completed');
  expect((await h.store.list(scope))[0].payload).toBeNull();
});
it('429 persists across reopen and C/E share the original absolute deadline', async () => {
  const h = await fixture();
  h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  await h.engine().confirm(scope, payload);
  await h.restart();
  h.now = 131000;
  const c = await createPendingExpenseStore(h.db);
  expect(await c.retryAt!(scope, key)).toBe(220000);
  const calls = h.request.mock.calls.length;
  await h.engine().recover(scope);
  await h.engine().retry(scope, key);
  expect(h.request).toHaveBeenCalledTimes(calls);
  expect(await h.store.retryAt(scope)).toBe(220000);
  await h.store.dismiss(scope, key);
  expect(await h.store.retryAt(scope)).toBe(220000);
  h.now = 220000;
  await h.engine().retry(scope, key);
  expect(h.posts).toBe(1);
});
it('C rate limit blocks E confirmation without creating a new operation', async () => {
  const h = await fixture();
  const c = await createPendingExpenseStore(h.db);
  await c.pause!(scope, key, 'busy', 220000);
  expect((await h.engine().confirm(scope, payload)).kind).toBe('not-sent');
  expect(h.request).not.toHaveBeenCalled();
  expect(await h.store.list(scope)).toEqual([]);
});
it('latest deadline is rechecked at transport after async waits', async () => {
  const h = await fixture();
  h.request.mockImplementationOnce(async (_user, _path, _schema, options) => {
    const c = await createPendingExpenseStore(h.db);
    await c.pause!(scope, key, 'busy', 220000);
    options?.beforeSend?.();
    return { tripId, ledger };
  });
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  expect(await h.store.retryAt(scope)).toBe(220000);
});
it('failed local completion retains pending for lookup, never duplicates a successful POST', async () => {
  const h = await fixture();
  vi.spyOn(h.store, 'complete').mockRejectedValueOnce(new Error('disk full'));
  expect((await h.engine().confirm(scope, payload)).kind).toBe('pending');
  await h.restart();
  await h.engine().retry(scope, key);
  expect(h.posts).toBe(1);
});
it('pending operation cannot be discarded', async () => {
  const h = await fixture();
  h.request.mockRejectedValue(new ApiError('NETWORK'));
  await h.engine().confirm(scope, payload);
  await h.store.dismiss(scope, key);
  expect(await h.store.list(scope)).toHaveLength(1);
});
it('schema 6 upgrade preserves C/D rows and account waits, failure rolls back the new table', async () => {
  const h = await fixture();
  const c = await createPendingExpenseStore(h.db);
  await c.pause!(scope, key, 'busy', 220000);
  await h.db.execAsync(
    `INSERT INTO draft_trip (environment, account_id, trip_id, name, options, updated_at, denied) VALUES ('env','actor','trip','name','{}',1,0); DROP TABLE pending_mutation; ALTER TABLE pending_expense DROP COLUMN api_version; ALTER TABLE pending_expense DROP COLUMN base_currency; ALTER TABLE pending_expense DROP COLUMN money_scale; ALTER TABLE expense_queue DROP COLUMN api_version; ALTER TABLE draft_trip DROP COLUMN archived; PRAGMA user_version = 6;`
  );
  const original = h.db.execAsync;
  const broken = {
    ...h.db,
    execAsync: async (sql: string) => {
      await original(sql);
      if (sql.includes('CREATE TABLE pending_mutation')) throw new Error('disk full');
    },
  };
  await expect(createMutationStore(broken)).rejects.toThrow('disk full');
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 6 });
  expect(
    await h.db.getFirstAsync("SELECT 1 FROM sqlite_master WHERE name = 'pending_mutation'")
  ).toBeNull();
  const upgraded = await createMutationStore(h.db);
  expect(await upgraded.retryAt(scope)).toBe(220000);
  expect(await h.db.getFirstAsync('SELECT name FROM draft_trip')).toEqual({ name: 'name' });
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 11 });
});

it.each(['TWD', 'USD', 'JPY'])(
  'BC2b lost %s creation response survives reopening and recovery in only the original scope',
  async (baseCurrency) => {
    const h = await fixture(baseCurrency);
    const original = {
      ...payload,
      body: { ...payload.body, base_currency: baseCurrency, name: 'Original trip' },
    };
    h.request.mockImplementationOnce(async () => {
      h.receipts.set(key, h.committed);
      throw new ApiError('NETWORK');
    });
    expect((await h.engine().confirm(scope, original)).kind).toBe('pending');
    const saved = (await h.store.list(scope))[0];
    expect(saved).toMatchObject({
      clientRequestId: key,
      apiVersion: 2,
      baseCurrency,
      moneyScale: 2,
      payload: { body: { ...original.body, client_request_id: key } },
    });
    await h.restart();
    const count = h.request.mock.calls.length;
    for (const other of [
      { ...scope, accountId: '333333333333333333333333' },
      { ...scope, environment: 'https://other/api/v1' },
    ]) {
      await h.engine().recover(other);
      expect(await h.store.list(other)).toEqual([]);
    }
    expect(h.request).toHaveBeenCalledTimes(count);
    // A changed/new currency intent cannot replace the saved request. Capabilities are not read by recovery.
    expect(
      (
        await h
          .engine()
          .confirm(scope, { ...original, body: { ...original.body, base_currency: 'EUR' } })
      ).kind
    ).toBe('blocked');
    await h.engine().recover(scope);
    expect(h.request.mock.calls.filter((c) => c[3]?.method === 'POST')).toHaveLength(1);
    expect(h.request.mock.calls.at(-1)?.[1]).toBe(`/mutation-requests/${key}`);
    expect((await h.store.list(scope))[0]).toMatchObject({
      status: 'completed',
      payload: null,
      result: h.committed,
    });
  }
);
it.each(['USD', 'JPY'])(
  'BC2b %s confirmed body and UUID survive 429 and restart with no capability lookup or early retry',
  async (baseCurrency) => {
    const h = await fixture(baseCurrency);
    const original = { ...payload, body: { ...payload.body, base_currency: baseCurrency } };
    h.request.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
    expect((await h.engine().confirm(scope, original)).kind).toBe('pending');
    await h.restart();
    h.now = 131000;
    const calls = h.request.mock.calls.length;
    await h.engine().recover(scope);
    await h.engine().retry(scope, key);
    expect(h.request).toHaveBeenCalledTimes(calls);
    expect(await h.store.retryAt(scope)).toBe(220000);
    expect((await h.store.list(scope))[0]).toMatchObject({
      payload: { body: { base_currency: baseCurrency, client_request_id: key } },
    });
    h.now = 220000;
    await h.engine().retry(scope, key);
    const posts = h.request.mock.calls.filter((c) => c[3]?.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[1][3]?.body).toEqual(posts[0][3]?.body);
    expect(h.request.mock.calls.some((c) => c[1] === '/capabilities')).toBe(false);
    expect((await h.store.list(scope))[0].result).toEqual(h.committed);
  }
);
it('BC2b a saved rejection releases creation only after a receipt is durably saved', async () => {
  const h = await fixture('USD');
  const original = { ...payload, body: { ...payload.body, base_currency: 'USD' } };
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  expect((await h.engine().confirm(scope, original)).kind).toBe('pending');
  const rejected = {
    status: 'rejected' as const,
    operation: 'trip.create' as const,
    code: 'FEATURE_NOT_AVAILABLE' as const,
  };
  const complete = vi.spyOn(h.store, 'complete').mockRejectedValueOnce(new Error('disk full'));
  h.request.mockResolvedValueOnce(rejected);
  expect((await h.engine().lookup(scope, key)).kind).toBe('pending');
  expect((await h.store.list(scope))[0]).toMatchObject({
    status: 'pending',
    payload: { body: { base_currency: 'USD' } },
  });
  complete.mockRestore();
  h.request.mockResolvedValueOnce(rejected);
  expect((await h.engine().lookup(scope, key)).kind).toBe('completed');
  expect((await h.store.list(scope))[0]).toMatchObject({
    status: 'completed',
    result: rejected,
    payload: null,
  });
  const next = '22222222-2222-4222-8222-222222222222';
  const engine = new TripEntry({
    store: async () => h.store,
    request: h.request as never,
    newId: () => next,
    active: () => true,
  });
  h.request.mockResolvedValueOnce({ tripId, ledger });
  expect((await engine.confirm(scope, payload)).kind).toBe('completed');
  expect((await h.store.list(scope)).map((r) => r.clientRequestId).sort()).toEqual([key, next]);
});
