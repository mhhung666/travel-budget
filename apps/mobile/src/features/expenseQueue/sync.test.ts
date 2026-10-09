import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClient, type Fetcher } from '@/api/client';
import { SessionManager } from '@/api/session';
import { expenseDetailSchema, type ExpenseOptions } from '@/api/contracts';
import { ExpenseEntry } from '@/features/expenses/entry';
import { confirmedFields } from '@/features/expenses/draft';
import { createExpenseQueueStore, type ExpenseQueueStore } from '@/storage/expenseQueue';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import type { StoredExpenseDraft } from '@/storage/expenseDrafts';
import { fakeExpenseServer, hex, uuidOf } from '@/test/expenseServer';
import { memoryDatabase } from '@/test/sqlite';
import { ExpenseQueue } from './sync';
import { LEGACY_PENDING_SQL } from '@/test/legacy';

const [ANN, BOB, CAT, TRIP, OTHER_TRIP] = [hex(1), hex(2), hex(3), hex(100), hex(101)];
const options: ExpenseOptions = {
  members: [ANN, BOB, CAT].map((id) => ({ id, displayName: id })),
  categories: ['food', 'other'],
};
const preview = {
  amount: 100,
  splits: [
    { userId: ANN, displayName: '', shareAmount: 33.34 },
    { userId: BOB, displayName: '', shareAmount: 33.33 },
    { userId: CAT, displayName: '', shareAmount: 33.33 },
  ],
};
// B5c-2: new queue records ask v2, whose options and preview carry the unit and original echo.
const ledger = { baseCurrency: 'TWD', moneyScale: 2 as const };
const v2preview = { ...preview, ledger, originalAmount: 100, currency: 'TWD', exchangeRate: 1 };
const opened: { close(): void }[] = [];
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  opened.splice(0).forEach((db) => db.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
async function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'tb-queue-'));
  dirs.push(dir);
  const path = join(dir, 'expenses.db');
  let db = memoryDatabase(path);
  opened.push(db);
  let pending = await createPendingExpenseStore(db);
  let store: ExpenseQueueStore = await createExpenseQueueStore(db);
  const server = fakeExpenseServer();
  server.addAccount(ANN, 'ann');
  server.addAccount(BOB, 'bob');
  [TRIP, OTHER_TRIP].forEach((trip) => [ANN, BOB, CAT].forEach((id) => server.addMember(trip, id)));
  let token: string | null = null;
  let currentOptions = options;
  const calls: { method: string; path: string; version: number; body: unknown }[] = [];
  let hook: ((path: string, method: string) => Promise<Response | void>) | undefined;
  const fetcher: Fetcher = async (url, init) => {
    const full = new URL(url).pathname;
    const version = Number(/^\/api\/v([12])\//.exec(full)?.[1]);
    const pathname = full.replace(/^\/api\/v[12]/, '');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path: pathname,
      version,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const response = await hook?.(pathname, method);
    if (response) return response;
    if (pathname.endsWith('/expense-options'))
      return Response.json({
        data: version === 2 ? { ledger, ...currentOptions } : currentOptions,
      });
    if (pathname.endsWith('/expenses/preview'))
      return Response.json({ data: version === 2 ? v2preview : preview });
    return server.fetcher(url.replace(/\/api\/v[12]/, ''), init);
  };
  const makeManager = () =>
    new SessionManager(
      new ApiClient('https://example.test/api/v1', fetcher),
      {
        get: async () => token,
        set: async (value) => {
          token = value;
        },
        clear: async () => {
          token = null;
        },
      },
      async () => {}
    );
  let manager = makeManager();
  await manager.login('ann', 'password');
  const scope = { environment: manager.api.environment, accountId: ANN };
  let active = true;
  let accessVersion = 0;
  let now = Date.now();
  let ids = 100;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const request: ConstructorParameters<typeof ExpenseEntry>[0]['request'] = (
    id,
    path,
    schema,
    opts
  ) => manager.requestAs(id, path, schema, opts);
  const makeEntry = () =>
    new ExpenseEntry({
      store: async () => pending,
      request,
      newId: () => uuidOf(++ids),
      now: () => now,
    });
  let entry = makeEntry();
  const makeQueue = () =>
    new ExpenseQueue({
      store: async () => store,
      request,
      entry,
      newId: () => uuidOf(++ids),
      now: () => now,
      authorizationVersion: () => accessVersion,
      active: (s) =>
        active &&
        s.environment === scope.environment &&
        manager.getSnapshot().status === 'signedIn' &&
        manager.getSnapshot().user?.id === s.accountId,
    });
  let queue = makeQueue();
  const draft = (n: number): StoredExpenseDraft => ({
    ...scope,
    tripId: TRIP,
    draftId: uuidOf(n),
    revision: 1,
    updatedAt: now,
    input: {
      description: `Dinner ${n}`,
      amountText: '100',
      date: '2026-10-05',
      category: 'food',
      payerId: ANN,
      memberIds: [ANN, BOB, CAT],
    },
  });
  const enqueue = async (n: number, tripId = TRIP) => {
    const d = { ...draft(n), tripId };
    await pending.drafts.start(d);
    await queue.enqueue(d, options);
    return (await store.list(scope)).at(-1)!;
  };
  return {
    server,
    get manager() {
      return manager;
    },
    scope,
    calls,
    draft,
    enqueue,
    get db() {
      return db;
    },
    get pending() {
      return pending;
    },
    get store() {
      return store;
    },
    get entry() {
      return entry;
    },
    get queue() {
      return queue;
    },
    deny() {
      accessVersion++;
    },
    active(value: boolean) {
      active = value;
    },
    options(value: ExpenseOptions) {
      currentOptions = value;
    },
    hook(fn: typeof hook) {
      hook = fn;
    },
    advance(ms: number) {
      now += ms;
    },
    breakStore(value: ExpenseQueueStore) {
      store = value;
    },
    async reopen() {
      db.close();
      opened.splice(opened.indexOf(db), 1);
      db = memoryDatabase(path);
      opened.push(db);
      manager = makeManager();
      await manager.restore();
      pending = await createPendingExpenseStore(db);
      store = await createExpenseQueueStore(db);
      entry = makeEntry();
      queue = makeQueue();
    },
  };
}

describe('confirmed equal-split queue and foreground sync', () => {
  it('queues several expenses without HTTP, reopens the file, sends sequentially with backend shares once', async () => {
    const h = await harness();
    h.active(false);
    const a = await h.enqueue(1);
    const b = await h.enqueue(2);
    expect(h.calls.filter((c) => c.path.includes('/trips/'))).toHaveLength(0);
    expect(await h.pending.drafts.load(h.scope, TRIP)).toBeNull();
    await h.reopen();
    expect(await h.queue.list(h.scope)).toHaveLength(2);
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(0);
    h.active(true);
    await Promise.all([h.queue.synchronize(h.scope), h.queue.synchronize(h.scope)]);
    expect(h.server.expenses).toHaveLength(2);
    expect(h.server.receipts.size).toBe(2);
    expect(
      h.server.posts().map((c) => (c.body as { client_request_id: string }).client_request_id)
    ).toEqual([a.clientRequestId, b.clientRequestId]);
    expect(h.server.posts()[0].body).toMatchObject({
      splits: [
        { user_id: ANN, share_amount: 33.34 },
        { user_id: BOB, share_amount: 33.33 },
        { user_id: CAT, share_amount: 33.33 },
      ],
    });
    expect(await h.queue.list(h.scope)).toEqual([]);
    expect(await h.pending.list(h.scope)).toEqual([]);
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(2);
  });
  it.each(['membership', 'order', 'category'] as const)(
    'requires explicit review after %s changes, never silently changes the confirmed content',
    async (change) => {
      const h = await harness();
      const r = await h.enqueue(1);
      h.options(
        change === 'membership'
          ? { ...options, members: options.members.slice(0, 2) }
          : change === 'order'
            ? { ...options, members: [...options.members].reverse() }
            : { ...options, categories: ['other'] }
      );
      await h.queue.synchronize(h.scope);
      expect(await h.store.list(h.scope)).toMatchObject([
        { status: 'attention', reason: 'members', input: r.input },
      ]);
      expect(h.server.posts()).toHaveLength(0);
      h.options(options);
      await h.queue.synchronize(h.scope);
      expect(h.server.posts()).toHaveLength(0);
      await h.queue.restore((await h.queue.list(h.scope))[0]);
      const restored = await h.pending.drafts.load(h.scope, TRIP);
      expect(restored?.input).toEqual(r.input);
      expect(restored?.draftId).not.toBe(h.draft(1).draftId);
      await h.queue.enqueue(restored!, options);
      await h.queue.synchronize(h.scope);
      expect(h.server.posts()).toHaveLength(1);
      expect(
        (h.server.posts()[0].body as { client_request_id: string }).client_request_id
      ).not.toBe(r.clientRequestId);
    }
  );
  it('stops between preflight stages when backgrounded, disconnected or switched away', async () => {
    const h = await harness();
    await h.enqueue(1);
    h.hook(async (path) => {
      if (path.endsWith('/expense-options')) h.active(false);
    });
    await h.queue.synchronize(h.scope);
    expect(h.calls.filter((c) => c.path.endsWith('/expenses/preview'))).toHaveLength(0);
    expect(h.server.posts()).toHaveLength(0);
    h.active(true);
    h.hook(async (path) => {
      if (path.endsWith('/expenses/preview')) h.active(false);
    });
    await h.queue.synchronize(h.scope);
    expect(await h.pending.list(h.scope)).toEqual([]);
    expect(h.server.posts()).toHaveLength(0);
  });
  it('recovers a crash after frozen handoff but before POST, using the original UUID', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    const payload = {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    };
    await h.store.prepare(r, payload);
    await h.reopen();
    await h.queue.synchronize(h.scope);
    expect(h.server.lookups()).toHaveLength(1);
    expect(h.server.posts()[0].body).toEqual(payload);
    expect(h.server.expenses).toHaveLength(1);
    expect(h.calls.filter((c) => c.path.endsWith('/expenses/preview'))).toHaveLength(0);
  });
  it('keeps a lost-answer receipt across restart and only looks it up, without repeating side effects', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    h.server.fail('POST', /\/expenses$/, { kind: 'drop-response' });
    // The v2 receipt check before the send finds nothing; the lookup after the lost answer fails.
    h.server.fail('GET', /expense-requests/, { kind: 'pass' });
    h.server.fail('GET', /expense-requests/, { kind: 'network' });
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared' }]);
    await h.reopen();
    h.advance(31_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.receipts.size).toBe(1);
    expect(await h.queue.list(h.scope)).toEqual([]);
    expect(h.server.lookups().at(-1)?.path).toContain(r.clientRequestId);
  });
  it('retries an unsent interrupted request with the same UUID and exact frozen payload', async () => {
    const h = await harness();
    await h.enqueue(1);
    await h.enqueue(2);
    h.server.fail('POST', /\/expenses$/, { kind: 'network' });
    await h.queue.synchronize(h.scope);
    const first = h.server.posts()[0].body;
    expect(h.server.posts()).toHaveLength(1);
    expect(await h.queue.list(h.scope)).toHaveLength(2);
    await h.reopen();
    h.advance(31_000);
    h.options({ ...options, members: [] }); // No new preflight for a frozen body.
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()[1].body).toEqual(first);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'attention' }]);
  });
  it('persists Retry-After across restart and gates both automatic and C manual retry', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 429, retryAfter: 120 });
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(1);
    await h.reopen();
    h.advance(31_000);
    await h.queue.synchronize(h.scope);
    const manual = await h.entry.retry(h.scope, r.clientRequestId);
    expect(manual.kind).toBe('unconfirmed');
    expect(h.server.posts()).toHaveLength(1);
    h.advance(90_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(2);
    expect(h.server.expenses).toHaveLength(1);
  });
  it('pauses expired authentication without touching another account’s records', async () => {
    const h = await harness();
    await h.enqueue(1);
    h.server.revoke(ANN);
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(0);
    await h.manager.login('bob', 'password');
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list({ ...h.scope, accountId: BOB })).toEqual([]);
    // The v2 receipt check learned the revocation, so nothing was posted with Ann's session.
    expect(h.server.posts()).toHaveLength(0);
    h.server.restore(ANN);
    await h.manager.login('ann', 'password');
    h.advance(31_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
  });
  it('keeps a known revoked trip for review before any write, and keeps a frozen request after later revocation', async () => {
    const h = await harness();
    await h.enqueue(1);
    h.hook(async (path) =>
      path.endsWith('/expense-options')
        ? Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
        : undefined
    );
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'attention', reason: 'access' }]);
    expect(h.server.posts()).toHaveLength(0);
    await h.queue.discard((await h.queue.list(h.scope))[0]);
    h.hook(undefined);
    const r = await h.enqueue(2);
    await h.store.prepare(r, {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    });
    h.server.removeMember(TRIP, ANN);
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared', reason: 'access' }]);
    await expect(h.queue.discard((await h.queue.list(h.scope))[0])).rejects.toThrow(
      'QUEUE_IMMUTABLE'
    );
  });
  it('preserves a different receipt from 409 as a resolved conflict requiring acknowledgement', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    const expense = expenseDetailSchema.parse({
      ledger,
      id: hex(900),
      amount: 100,
      originalAmount: 100,
      currency: 'TWD',
      exchangeRate: 1,
      payerId: ANN,
      payerName: '',
      description: 'Other content',
      category: 'food',
      date: '2026-10-05',
      splits: preview.splits.map((s) => ({ ...s, displayName: '' })),
    });
    h.server.seedReceipt(TRIP, ANN, r.clientRequestId, expense);
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'resolved', reason: 'conflict' }]);
    expect(await h.pending.list(h.scope)).toEqual([]);
    await h.queue.synchronize(h.scope);
    // The v2 receipt check found the other content before anything was sent.
    expect(h.server.posts()).toHaveLength(0);
    await expect(h.queue.restore((await h.queue.list(h.scope))[0])).rejects.toThrow(
      'QUEUE_RESOLVED'
    );
    await h.queue.discard((await h.queue.list(h.scope))[0]);
    expect(await h.queue.list(h.scope)).toEqual([]);
  });
  it('does not bypass an unresolved C expense of the same trip', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    await h.pending.insert({
      ...h.scope,
      tripId: TRIP,
      clientRequestId: uuidOf(900),
      apiVersion: 2,
      payload: {
        ...confirmedFields(r.input, { ...options, ledger }, v2preview),
        client_request_id: uuidOf(900),
      },
      status: 'unconfirmed',
      createdAt: 1,
      updatedAt: 1,
    });
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(0);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'queued' }]);
  });
  it('does not send when the frozen handoff cannot be saved', async () => {
    const h = await harness();
    await h.enqueue(1);
    const real = h.store;
    h.breakStore({
      ...real,
      prepare: async () => {
        throw new Error('disk full');
      },
    });
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(0);
    expect(await real.list(h.scope)).toMatchObject([{ status: 'queued' }]);
  });
  it('refuses invalid input before queue confirmation', async () => {
    const h = await harness();
    const d = h.draft(1);
    d.input.amountText = '12.';
    await h.pending.drafts.start(d);
    await expect(h.queue.enqueue(d, options)).rejects.toThrow('INVALID_DRAFT');
    expect(await h.queue.list(h.scope)).toEqual([]);
    expect(h.server.posts()).toHaveLength(0);
  });
});

it.each(['expense-options', 'expenses/preview'])(
  'blocks a response crossing a newer denial during %s',
  async (endpoint) => {
    const h = await harness();
    await h.enqueue(1);
    h.hook(async (path) => {
      if (path.endsWith(endpoint)) h.deny();
    });
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'attention', reason: 'access' }]);
    expect(h.server.posts()).toHaveLength(0);
    expect(await h.pending.list(h.scope)).toEqual([]);
  }
);
it('does not adopt an old account response after switching accounts during preflight', async () => {
  const h = await harness();
  await h.enqueue(1);
  h.hook(async (path) => {
    if (path.endsWith('/expense-options')) await h.manager.login('bob', 'password');
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(0);
  expect(await h.queue.list(h.scope)).toHaveLength(1);
  expect(await h.queue.list({ ...h.scope, accountId: BOB })).toEqual([]);
});
it('keeps the original frozen request when refresh fails with 500, then resumes after authentication recovers', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 401, code: 'UNAUTHORIZED' });
  h.hook(async (path) =>
    path === '/auth/refresh'
      ? Response.json({ error: { code: 'SERVER_ERROR' } }, { status: 500 })
      : undefined
  );
  await h.queue.synchronize(h.scope);
  expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared' }]);
  expect(await h.pending.list(h.scope)).toHaveLength(1);
  expect(h.server.expenses).toHaveLength(0);
  const original = h.server.posts()[0].body;
  h.hook(undefined);
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts().at(-1)?.body).toEqual(original);
  expect(h.server.expenses).toHaveLength(1);
  expect(h.server.lookups().at(-1)?.path).toContain(r.clientRequestId);
});
it('retains a 409 with no visible receipt and never automatically substitutes another UUID', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, {
    kind: 'status',
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
  await h.queue.synchronize(h.scope);
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  expect(await h.queue.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'conflict', clientRequestId: r.clientRequestId },
  ]);
});
it('does not replace a confirmed equal split if the backend returns a mismatched preview', async () => {
  const h = await harness();
  await h.enqueue(1);
  h.hook(async (path) =>
    path.endsWith('/expenses/preview')
      ? Response.json({ data: { ...preview, amount: 99 } })
      : undefined
  );
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(0);
  expect(await h.pending.list(h.scope)).toEqual([]);
  expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'queued' }]);
});
it('reports automatic synchronization storage errors by account and clears them after recovery', async () => {
  const h = await harness();
  await h.enqueue(1);
  const real = h.store;
  h.breakStore({
    ...real,
    list: async () => {
      throw new Error('cannot read database');
    },
  });
  await expect(h.queue.synchronize(h.scope)).rejects.toThrow('cannot read database');
  expect(h.queue.getSnapshot().failedScopes).toEqual([
    JSON.stringify([h.scope.environment, h.scope.accountId]),
  ]);
  expect(h.server.posts()).toHaveLength(0);
  h.breakStore(real);
  await h.queue.synchronize(h.scope);
  expect(h.queue.getSnapshot().failedScopes).toEqual([]);
  expect(h.server.expenses).toHaveLength(1);
});
it('keeps the 409 investigation flag through later transient lookup errors', async () => {
  const h = await harness();
  await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, {
    kind: 'status',
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
  await h.queue.synchronize(h.scope);
  h.advance(31_000);
  h.server.fail('GET', /expense-requests/, { kind: 'network' });
  await h.queue.synchronize(h.scope);
  expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared', reason: 'conflict' }]);
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  expect(await h.queue.list(h.scope)).toHaveLength(1);
});

it('rechecks revocation after the asynchronous frozen handoff before starting POST', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  const real = h.store;
  h.breakStore({
    ...real,
    prepare: async (record, payload) => {
      const prepared = await real.prepare(record, payload);
      h.deny();
      return prepared;
    },
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(0);
  expect(await real.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'access', clientRequestId: r.clientRequestId },
  ]);
  expect(await h.pending.list(h.scope)).toMatchObject([
    { clientRequestId: r.clientRequestId, payload: { client_request_id: r.clientRequestId } },
  ]);
});

it('persists a 429 received by C manual retry before returning to the queue', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  const payload = {
    ...confirmedFields(r.input, { ...options, ledger }, v2preview),
    client_request_id: r.clientRequestId,
  };
  await h.store.prepare(r, payload);
  h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 429, retryAfter: 120 });
  expect(await h.entry.retry(h.scope, r.clientRequestId)).toMatchObject({
    kind: 'unconfirmed',
    reason: 'busy',
  });
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(await h.entry.lookup(h.scope, r.clientRequestId)).toMatchObject({
    kind: 'unconfirmed',
    reason: 'busy',
  });
  expect(await h.entry.retry(h.scope, r.clientRequestId)).toMatchObject({
    kind: 'unconfirmed',
    reason: 'busy',
  });
  expect(h.server.posts()).toHaveLength(1);
  // Only the receipt check of the first retry, before its POST received the 429.
  expect(h.server.lookups()).toHaveLength(1);
  h.advance(90_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts().at(-1)?.body).toEqual(payload);
  expect(h.server.expenses).toHaveLength(1);
});

it('retains the longer 429 wait from the lookup following a failed POST', async () => {
  const h = await harness();
  await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, { kind: 'network' });
  h.server.fail('GET', /expense-requests/, { kind: 'pass' });
  h.server.fail('GET', /expense-requests/, { kind: 'status', status: 429, retryAfter: 120 });
  await h.queue.synchronize(h.scope);
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  // The receipt check before the POST, then the follow-up that received the 429.
  expect(h.server.lookups()).toHaveLength(2);
  h.advance(90_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(1);
});

it('persists a POST 409 before a lookup access denial can mask the conflict', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, {
    kind: 'status',
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
  h.server.fail('GET', /expense-requests/, { kind: 'pass' });
  h.server.fail('GET', /expense-requests/, { kind: 'status', status: 403, code: 'FORBIDDEN' });
  await h.queue.synchronize(h.scope);
  expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared', reason: 'conflict' }]);
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  expect(h.server.expenses).toHaveLength(0);
  expect(await h.queue.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'conflict', clientRequestId: r.clientRequestId },
  ]);
});

it.each(['lookup', 'recover'] as const)(
  'persists a 429 received by C %s across a full restart',
  async (operation) => {
    const h = await harness();
    const r = await h.enqueue(1);
    await h.store.prepare(r, {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    });
    h.server.fail('GET', /expense-requests/, { kind: 'status', status: 429, retryAfter: 120 });
    const result =
      operation === 'lookup'
        ? await h.entry.lookup(h.scope, r.clientRequestId)
        : (await h.entry.recover(h.scope))[0];
    expect(result).toMatchObject({ kind: 'unconfirmed', reason: 'busy' });
    expect(await h.pending.retryAt!(h.scope, r.clientRequestId)).toBe(Date.now() + 120_000);
    await h.reopen();
    h.advance(31_000);
    await h.queue.synchronize(h.scope);
    expect(await h.entry.retry(h.scope, r.clientRequestId)).toMatchObject({
      kind: 'unconfirmed',
      reason: 'busy',
    });
    expect(h.server.lookups()).toHaveLength(1);
    expect(h.server.posts()).toHaveLength(0);
    h.advance(90_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
  }
);

it('persists a manual C 409 before its follow-up lookup receives a 429', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  await h.store.prepare(r, {
    ...confirmedFields(r.input, { ...options, ledger }, v2preview),
    client_request_id: r.clientRequestId,
  });
  h.server.fail('POST', /\/expenses$/, {
    kind: 'status',
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
  h.server.fail('GET', /expense-requests/, { kind: 'pass' });
  h.server.fail('GET', /expense-requests/, { kind: 'status', status: 429, retryAfter: 120 });
  expect(await h.entry.retry(h.scope, r.clientRequestId)).toMatchObject({
    kind: 'unconfirmed',
    reason: 'busy',
  });
  expect(await h.queue.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'conflict', nextAt: Date.now() + 120_000 },
  ]);
  await h.reopen();
  h.advance(121_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  expect(await h.queue.list(h.scope)).toMatchObject([{ status: 'prepared', reason: 'conflict' }]);
});

it.each(['get', 'retryAt', 'setStatus'])(
  'blocks revocation during C %s after the handoff check',
  async (operation) => {
    const h = await harness();
    const r = await h.enqueue(1);
    const get = h.pending.get;
    vi.spyOn(h.pending, 'get').mockImplementation(async (scope, id) => {
      const record = await get(scope, id);
      if (operation === 'get') h.deny();
      // Recovered C records update their status before POST, adding another SQLite await.
      return operation === 'setStatus' && record ? { ...record, status: 'unconfirmed' } : record;
    });
    if (operation === 'retryAt') {
      const retryAt = h.pending.retryAt!;
      vi.spyOn(h.pending, 'retryAt').mockImplementation(async (scope, id) => {
        const result = await retryAt(scope, id);
        h.deny();
        return result;
      });
    }
    if (operation === 'setStatus') {
      const setStatus = h.pending.setStatus;
      vi.spyOn(h.pending, 'setStatus').mockImplementation(async (...args) => {
        await setStatus(...args);
        h.deny();
      });
    }
    await h.queue.synchronize(h.scope);
    expect(h.server.posts()).toHaveLength(0);
    expect(h.server.expenses).toHaveLength(0);
    expect(await h.store.list(h.scope)).toMatchObject([
      { status: 'prepared', reason: 'access', clientRequestId: r.clientRequestId },
    ]);
    expect(await h.pending.list(h.scope)).toMatchObject([
      { clientRequestId: r.clientRequestId, payload: { client_request_id: r.clientRequestId } },
    ]);
  }
);

it('blocks a prepared retry when revocation arrives during its receipt lookup', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  await h.store.prepare(r, {
    ...confirmedFields(r.input, { ...options, ledger }, v2preview),
    client_request_id: r.clientRequestId,
  });
  h.hook(async (path) => {
    if (path.includes('/expense-requests/')) h.deny();
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(0);
  expect(await h.store.list(h.scope)).toMatchObject([{ status: 'prepared', reason: 'access' }]);
});

it('blocks the automatic POST replay when revocation arrives during credential refresh', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 401, code: 'UNAUTHORIZED' });
  h.hook(async (path) => {
    if (path.endsWith('/auth/refresh')) h.deny();
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()).toHaveLength(1);
  expect(h.server.expenses).toHaveLength(0);
  expect(await h.store.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'access', clientRequestId: r.clientRequestId },
  ]);
  expect(await h.pending.list(h.scope)).toHaveLength(1);
});

it('blocks revocation while C retry waits behind an earlier serialized lookup', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let retryStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    retryStarted = resolve;
  });
  h.hook(async (path) => {
    if (path.includes('/expense-requests/')) await gate;
  });
  const real = h.store;
  let lookup: ReturnType<typeof h.entry.lookup> | undefined;
  h.breakStore({
    ...real,
    prepare: async (record, payload) => {
      const prepared = await real.prepare(record, payload);
      lookup = h.entry.lookup(h.scope, record.clientRequestId);
      return prepared;
    },
  });
  const retry = h.entry.retry.bind(h.entry);
  vi.spyOn(h.entry, 'retry').mockImplementation((...args) => {
    retryStarted();
    return retry(...args);
  });
  const run = h.queue.synchronize(h.scope);
  await started;
  h.deny();
  release();
  await run;
  await lookup;
  expect(h.server.posts()).toHaveLength(0);
  expect(await real.list(h.scope)).toMatchObject([
    { status: 'prepared', reason: 'access', clientRequestId: r.clientRequestId },
  ]);
  expect(await h.pending.list(h.scope)).toHaveLength(1);
});

it.each(['new', 'prepared', 'retry'] as const)(
  'skips a %s 409 without receipt and its trip, persists the wait, and sends other trips',
  async (state) => {
    const h = await harness();
    const r = await h.enqueue(1);
    await h.enqueue(2);
    const other = await h.enqueue(3, OTHER_TRIP);
    const payload = {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    };
    if (state !== 'new') {
      await h.store.prepare(r, payload);
      if (state === 'prepared') await h.store.pause(r, 'conflict', 0);
    }
    if (state !== 'prepared') {
      h.server.fail('POST', new RegExp(`/trips/${TRIP}/expenses$`), {
        kind: 'status',
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      });
    }
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.posts().at(-1)?.body).toMatchObject({
      client_request_id: other.clientRequestId,
    });
    expect(await h.queue.list(h.scope)).toMatchObject([
      {
        clientRequestId: r.clientRequestId,
        status: 'prepared',
        reason: 'conflict',
        nextAt: Date.now() + 30_000,
      },
      { status: 'queued' },
    ]);
    expect((await h.pending.get(h.scope, r.clientRequestId))?.payload).toEqual(payload);
    const before = h.calls.length;
    await h.reopen();
    await h.enqueue(4, OTHER_TRIP);
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(2);
    expect(h.calls.slice(before).filter((c) => c.path.includes(`/trips/${TRIP}/`))).toEqual([]);
    h.advance(31_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.posts().filter((c) => c.path.includes(`/trips/${TRIP}/`))).toHaveLength(
      state === 'prepared' ? 0 : 1
    );
    expect(await h.queue.list(h.scope)).toMatchObject([
      { clientRequestId: r.clientRequestId, reason: 'conflict', nextAt: Date.now() + 30_000 },
      { status: 'queued' },
    ]);
  }
);

it('waits durably behind C for just that trip and resumes after C resolves without blocking other trips', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  await h.enqueue(2);
  await h.enqueue(3, OTHER_TRIP);
  const id = uuidOf(900);
  await h.pending.insert({
    ...h.scope,
    tripId: TRIP,
    clientRequestId: id,
    apiVersion: 2,
    payload: {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: id,
    },
    status: 'unconfirmed',
    createdAt: 1,
    updatedAt: 1,
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(1);
  expect(await h.queue.list(h.scope)).toMatchObject([
    { status: 'queued', reason: 'pending', nextAt: Date.now() + 30_000 },
    { status: 'queued' },
  ]);
  const before = h.calls.length;
  await h.reopen();
  await h.enqueue(4, OTHER_TRIP);
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(2);
  expect(h.calls.slice(before).filter((c) => c.path.includes(`/trips/${TRIP}/`))).toEqual([]);
  await h.pending.remove(h.scope, id);
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(4);
  expect(h.server.receipts.size).toBe(4);
  expect(await h.queue.list(h.scope)).toEqual([]);
});

it('still blocks subsequent trips during a transient 429 and its persisted cooldown', async () => {
  const h = await harness();
  await h.enqueue(1);
  await h.enqueue(2, OTHER_TRIP);
  h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 429, retryAfter: 120 });
  await h.queue.synchronize(h.scope);
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.calls.filter((c) => c.path.includes(`/trips/${OTHER_TRIP}/`))).toEqual([]);
  expect(h.server.expenses).toHaveLength(0);
  h.advance(90_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(2);
  expect(h.server.receipts.size).toBe(2);
});

it.each(
  (['lookup', 'recover', 'retry'] as const).flatMap((operation) =>
    [false, true].map((otherTripFirst) => ({ operation, otherTripFirst }))
  )
)(
  'keeps a conflict 429 account-wide after restart: $operation, other trip first=$otherTripFirst',
  async ({ operation, otherTripFirst }) => {
    const h = await harness();
    if (otherTripFirst) await h.enqueue(1, OTHER_TRIP);
    const r = await h.enqueue(2);
    if (!otherTripFirst) await h.enqueue(3, OTHER_TRIP);
    await h.store.prepare(r, {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    });
    await h.store.pause(r, 'conflict', 0);
    const method = operation === 'retry' ? 'POST' : 'GET';
    h.server.fail(method, operation === 'retry' ? /\/expenses$/ : /expense-requests/, {
      kind: 'status',
      status: 429,
      retryAfter: 120,
    });
    if (operation === 'recover') await h.entry.recover(h.scope);
    else await h.entry[operation](h.scope, r.clientRequestId);
    const before = h.calls.length;
    await h.reopen();
    h.advance(31_000);
    // A later trip-local wait cannot shorten or change the scope of the rate limit.
    await h.store.pause(r, 'conflict', Date.now() + 30_000);
    await h.queue.synchronize(h.scope);
    expect(h.calls.slice(before).filter((c) => c.path.startsWith('/trips/'))).toEqual([]);
    expect(h.server.expenses).toHaveLength(0);
    h.advance(89_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.posts().filter((p) => p.path.includes(`/trips/${OTHER_TRIP}/`))).toHaveLength(
      1
    );
    expect(await h.queue.list(h.scope)).toMatchObject([
      { clientRequestId: r.clientRequestId, status: 'prepared', reason: 'conflict' },
    ]);
    expect(h.server.posts().filter((p) => p.path.includes(`/trips/${TRIP}/`))).toHaveLength(
      operation === 'retry' ? 1 : 0
    );
  }
);

it('retains the account rate limit when a queue POST 409 is followed by a lookup 429', async () => {
  const h = await harness();
  const r = await h.enqueue(1);
  await h.enqueue(2, OTHER_TRIP);
  h.server.fail('POST', /\/expenses$/, {
    kind: 'status',
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
  });
  h.server.fail('GET', /expense-requests/, { kind: 'pass' });
  h.server.fail('GET', /expense-requests/, { kind: 'status', status: 429, retryAfter: 120 });
  await h.queue.synchronize(h.scope);
  expect(await h.queue.list(h.scope)).toMatchObject([
    { reason: 'conflict', rateLimitUntil: Date.now() + 120_000 },
    { status: 'queued' },
  ]);
  const before = h.calls.length;
  await h.reopen();
  h.advance(31_000);
  await h.queue.synchronize(h.scope);
  expect(h.calls.slice(before).filter((c) => c.path.startsWith('/trips/'))).toEqual([]);
  h.advance(89_000);
  await h.queue.synchronize(h.scope);
  expect(h.server.expenses).toHaveLength(1);
  expect(h.server.receipts.size).toBe(1);
  expect(h.server.posts().filter((p) => p.path.includes(`/trips/${TRIP}/`))).toHaveLength(1);
  expect(await h.queue.list(h.scope)).toMatchObject([
    { clientRequestId: r.clientRequestId, reason: 'conflict' },
  ]);
});

it.each(['lookup', 'retry', 'recover'] as const)(
  'blocks C %s on another trip through a full restart until the account deadline',
  async (operation) => {
    const h = await harness();
    const a = await h.enqueue(1);
    const b = await h.enqueue(2, OTHER_TRIP);
    for (const r of [a, b])
      await h.store.prepare(r, {
        ...confirmedFields(r.input, { ...options, ledger }, v2preview),
        client_request_id: r.clientRequestId,
      });
    h.server.fail('GET', /expense-requests/, { kind: 'status', status: 429, retryAfter: 120 });
    await h.entry.lookup(h.scope, a.clientRequestId);
    await h.reopen();
    h.advance(31_000);
    const before = h.calls.length;
    const invoke = () =>
      operation === 'recover'
        ? h.entry.recover(h.scope)
        : h.entry[operation](h.scope, b.clientRequestId);
    await invoke();
    expect(h.calls.slice(before)).toEqual([]);
    h.advance(89_000);
    await invoke();
    expect(h.calls.slice(before).some((c) => c.path.includes(`/trips/${OTHER_TRIP}/`))).toBe(true);
  }
);

it.each(['discard', 'restore'] as const)(
  'retains the account wait after %s removes the last rate-limited queue row',
  async (operation) => {
    const h = await harness();
    const a = await h.enqueue(1);
    h.hook(async (path) =>
      path.endsWith('/expense-options')
        ? Response.json(
            { error: { code: 'RATE_LIMITED' } },
            { status: 429, headers: { 'Retry-After': '120' } }
          )
        : undefined
    );
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([{ reason: 'busy' }]);
    if (operation === 'discard') await h.queue.discard(a);
    else await h.queue.restore(a);
    expect(await h.queue.list(h.scope)).toEqual([]);
    h.hook(undefined);
    await h.reopen();
    h.advance(31_000);
    await h.enqueue(2, OTHER_TRIP);
    const before = h.calls.length;
    await h.queue.synchronize(h.scope);
    expect(h.calls.slice(before)).toEqual([]);
    expect(h.server.expenses).toHaveLength(0);
    h.advance(89_000);
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(1);
  }
);

it.each(
  ['queue', 'pending'].flatMap((writer) =>
    ['retryAt', 'setStatus', 'refresh', 'lookup', 'follow-up lookup'].map((operation) => ({
      writer,
      operation,
    }))
  )
)(
  'blocks a new cross-trip rate limit from $writer during C $operation',
  async ({ writer, operation }) => {
    const h = await harness();
    const a = await h.enqueue(1);
    const b = await h.enqueue(2, OTHER_TRIP);
    await h.store.prepare(b, {
      ...confirmedFields(b.input, { ...options, ledger }, v2preview),
      client_request_id: b.clientRequestId,
    });
    await h.pending.setStatus(h.scope, b.clientRequestId, 'unconfirmed');
    const until = Date.now() + 120_000;
    const pause = () =>
      writer === 'queue'
        ? h.store.pause(a, 'busy', until)
        : h.pending.pause!(h.scope, a.clientRequestId, 'busy', until);
    if (operation === 'retryAt' || operation === 'lookup') {
      const retryAt = h.pending.retryAt!;
      vi.spyOn(h.pending, 'retryAt').mockImplementationOnce(async (...args) => {
        const stale = await retryAt(...args);
        await pause();
        return stale;
      });
    } else if (operation === 'setStatus' || operation === 'follow-up lookup') {
      const setStatus = h.pending.setStatus;
      vi.spyOn(h.pending, 'setStatus').mockImplementation(async (...args) => {
        await setStatus(...args);
        // The v2 receipt check also writes `unconfirmed`; the follow-up is the write after POST.
        if (operation === 'setStatus' ? args[2] === 'sending' : h.server.posts().length > 0)
          await pause();
      });
      if (operation === 'follow-up lookup')
        h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 500 });
    } else {
      h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 401 });
      h.hook(async (path) => {
        if (path.endsWith('/auth/refresh')) await pause();
      });
    }
    h.calls.length = 0;
    const outcome =
      operation === 'lookup'
        ? await h.entry.lookup(h.scope, b.clientRequestId)
        : await h.entry.retry(h.scope, b.clientRequestId);
    expect(outcome).toMatchObject({ kind: 'unconfirmed', reason: 'busy' });
    // A retry's v2 receipt check ran before the deadline was written; nothing is asked after it.
    expect(h.calls.filter((c) => c.path.includes('/expense-requests/'))).toHaveLength(
      operation === 'retryAt' || operation === 'lookup' ? 0 : 1
    );
    expect(h.server.posts()).toHaveLength(
      operation === 'refresh' || operation === 'follow-up lookup' ? 1 : 0
    );
    expect(h.server.expenses).toHaveLength(0);
    expect(await h.pending.get(h.scope, b.clientRequestId)).toMatchObject({
      payload: { client_request_id: b.clientRequestId },
    });
    expect(await h.store.rateLimitUntil(h.scope)).toBe(until);
    h.advance(119_000);
    expect(await h.entry.retry(h.scope, b.clientRequestId)).toMatchObject({
      kind: 'unconfirmed',
      reason: 'busy',
    });
    expect(await h.store.rateLimitUntil(h.scope)).toBe(until);
    h.advance(1_000);
    expect(await h.entry.retry(h.scope, b.clientRequestId)).toMatchObject({ kind: 'saved' });
    expect(h.server.expenses).toHaveLength(1);
  }
);

it.each(['load', 'lookup', 'post', 'refresh'] as const)(
  'keeps the original deadline when D receives a local C %s block with one second left',
  async (operation) => {
    const h = await harness();
    // Process B first so A can establish the account wait while B is already in flight.
    const b = await h.enqueue(1, OTHER_TRIP);
    const a = await h.enqueue(2);
    if (operation === 'lookup')
      await h.store.prepare(b, {
        ...confirmedFields(b.input, { ...options, ledger }, v2preview),
        client_request_id: b.clientRequestId,
      });
    const until = Date.now() + 120_000;
    const pause = async () => {
      await h.store.pause(a, 'busy', until);
      h.advance(119_001);
    };
    if (operation === 'load' || operation === 'lookup') {
      const retryAt = h.pending.retryAt!;
      vi.spyOn(h.pending, 'retryAt').mockImplementationOnce(async (...args) => {
        const stale = await retryAt(...args);
        await pause();
        return operation === 'load' ? until : stale;
      });
    } else if (operation === 'post') {
      const prepare = h.store.prepare;
      vi.spyOn(h.store, 'prepare').mockImplementationOnce(async (...args) => {
        const result = await prepare(...args);
        await setStatus(h.scope, b.clientRequestId, 'unconfirmed');
        return result;
      });
      const setStatus = h.pending.setStatus;
      vi.spyOn(h.pending, 'setStatus').mockImplementationOnce(async (...args) => {
        await setStatus(...args);
        await pause();
      });
    } else {
      h.server.fail('POST', /\/expenses$/, { kind: 'status', status: 401 });
      h.hook(async (path) => {
        if (path.endsWith('/auth/refresh')) await pause();
      });
    }
    await h.queue.synchronize(h.scope);
    expect(h.server.expenses).toHaveLength(0);
    expect(h.server.posts()).toHaveLength(operation === 'refresh' ? 1 : 0);
    // Only B's v2 receipt check, which ran before the deadline was written.
    expect(h.calls.filter((call) => call.path.includes('/expense-requests/'))).toHaveLength(
      operation === 'post' || operation === 'refresh' ? 1 : 0
    );
    expect(await h.store.rateLimitUntil(h.scope)).toBe(until);
    expect((await h.queue.list(h.scope))[0].nextAt).toBe(until);
    const payload = (await h.pending.get(h.scope, b.clientRequestId))!.payload;
    h.hook(undefined);
    await h.reopen();
    const before = h.calls.length;
    h.advance(998);
    await h.queue.synchronize(h.scope);
    expect(h.calls).toHaveLength(before);
    h.advance(1);
    await h.queue.synchronize(h.scope);
    const posts = h.calls.slice(before).filter((call) => call.path.endsWith('/expenses'));
    expect(posts[0].body).toEqual(payload);
    expect(h.server.expenses).toHaveLength(2);
    expect(h.server.receipts.size).toBe(2);
  }
);

it('rejects foreign enqueue even through the engine and skips injected foreign intent during synchronization', async () => {
  const h = await harness();
  const d = { ...h.draft(1), input: { ...h.draft(1).input, currency: 'JPY', rateText: '0.215' } };
  await h.pending.drafts.start(d);
  await expect(h.queue.enqueue(d, options)).rejects.toThrow('UNSUPPORTED_QUEUE_CURRENCY');
  expect(h.calls.filter((c) => c.path.includes('/expenses'))).toHaveLength(0);
  // Simulate a future/externally injected intent; G2 must never silently reinterpret it as TWD.
  await h.db.runAsync(
    "INSERT INTO expense_queue (environment, account_id, client_request_id, trip_id, input, roster, status, reason, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, 0, 1)",
    h.scope.environment,
    h.scope.accountId,
    uuidOf(900),
    TRIP,
    JSON.stringify(d.input),
    JSON.stringify([ANN, BOB, CAT])
  );
  await h.enqueue(2, OTHER_TRIP);
  await h.queue.synchronize(h.scope);
  expect((await h.store.list(h.scope)).find((r) => r.tripId === TRIP)).toMatchObject({
    status: 'attention',
    reason: 'currency',
  });
  expect(h.calls.some((c) => c.path.includes(TRIP))).toBe(false);
  expect(h.server.expenses).toHaveLength(1);
});

describe('B5c-2 / B5d-1 queue versions', () => {
  const trips = (h: Awaited<ReturnType<typeof harness>>, trip = TRIP) =>
    h.calls.filter((c) => c.path.startsWith(`/trips/${trip}/`));
  const legacy = (h: Awaited<ReturnType<typeof harness>>, id: string) =>
    h.db.runAsync('UPDATE expense_queue SET api_version = 1 WHERE client_request_id = ?', id);

  it('sends a new queued expense on v2 from options to the write, once, with its unit', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    expect(r.apiVersion).toBe(2);
    // Two concurrent runs share one synchronization; the trip gets one expense and receipt.
    await Promise.all([h.queue.synchronize(h.scope), h.queue.synchronize(h.scope)]);
    expect(trips(h).map((c) => [c.method, c.path.split('/').at(-1), c.version])).toEqual([
      ['GET', 'expense-options', 2],
      ['POST', 'preview', 2],
      ['GET', r.clientRequestId, 2],
      ['POST', 'expenses', 2],
    ]);
    expect(h.server.posts()[0].body).toEqual({
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    });
    expect(h.server.posts()[0].body).toMatchObject({ base_currency: 'TWD' });
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.receipts.size).toBe(1);
    expect(await h.queue.list(h.scope)).toEqual([]);
    expect(await h.pending.list(h.scope)).toEqual([]);
  });

  it('resumes a prepared v2 record with one receipt check, never a second write after a lost answer', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    h.server.fail('POST', /\/expenses$/, { kind: 'drop-response' });
    h.server.fail('GET', /expense-requests/, { kind: 'pass' });
    h.server.fail('GET', /expense-requests/, { kind: 'network' });
    await h.queue.synchronize(h.scope);
    expect(await h.pending.list(h.scope)).toMatchObject([{ apiVersion: 2, baseCurrency: 'TWD' }]);
    await h.reopen();
    h.advance(31_000);
    const before = h.calls.length;
    await h.queue.synchronize(h.scope);
    expect(
      h.calls
        .slice(before)
        .filter((c) => c.path.startsWith('/trips/'))
        .map((c) => c.version)
    ).toEqual([2]);
    expect(h.server.lookups().at(-1)?.path).toContain(r.clientRequestId);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.queue.list(h.scope)).toEqual([]);
  });

  it('holds a record queued by an older release for review, sending nothing for it (B5d-1)', async () => {
    const h = await harness();
    const old = await h.enqueue(1);
    await legacy(h, old.clientRequestId);
    const fresh = await h.enqueue(2, OTHER_TRIP);
    await h.reopen();
    await h.queue.synchronize(h.scope);
    expect(trips(h)).toEqual([]);
    expect(trips(h, OTHER_TRIP).every((c) => c.version === 2)).toBe(true);
    expect(h.server.posts().map((c) => c.body)).toMatchObject([
      { client_request_id: fresh.clientRequestId, base_currency: 'TWD' },
    ]);
    expect(await h.queue.list(h.scope)).toMatchObject([
      {
        clientRequestId: old.clientRequestId,
        status: 'attention',
        reason: 'retired',
        apiVersion: 1,
      },
    ]);
    // Reviewing it again starts from the raw draft; the old record is never sent.
    await h.queue.restore((await h.queue.list(h.scope))[0]);
    expect((await h.pending.drafts.load(h.scope, TRIP))?.input).toEqual(old.input);
    await h.queue.synchronize(h.scope);
    expect(trips(h)).toEqual([]);
    expect(await h.queue.list(h.scope)).toEqual([]);
  });

  it('never looks up or resends a v1 record prepared by an older release; discarding clears both rows', async () => {
    const h = await harness();
    const r = await h.enqueue(1);
    const other = await h.enqueue(2, OTHER_TRIP);
    const live = (await h.store.list(h.scope))[0];
    await h.store.prepare(live, {
      ...confirmedFields(r.input, { ...options, ledger }, v2preview),
      client_request_id: r.clientRequestId,
    });
    // What a pre-B5c-2 release wrote: both rows v1 and a body without a unit.
    await h.db.execAsync(
      LEGACY_PENDING_SQL +
        "UPDATE pending_expense SET api_version = 1; UPDATE expense_queue SET api_version = 1 WHERE status = 'prepared';"
    );
    await h.reopen();
    await h.queue.synchronize(h.scope);
    expect(trips(h)).toEqual([]);
    expect(h.server.posts().map((c) => c.body)).toMatchObject([
      { client_request_id: other.clientRequestId },
    ]);
    expect(await h.entry.retry(h.scope, r.clientRequestId)).toMatchObject({
      kind: 'unconfirmed',
      reason: 'retired',
    });
    expect(trips(h)).toEqual([]);
    const [prepared] = await h.queue.list(h.scope);
    expect(prepared).toMatchObject({ status: 'prepared', apiVersion: 1 });
    await expect(h.queue.abandon({ ...prepared, apiVersion: 2 })).rejects.toThrow('NOT_RETIRED');
    await h.queue.abandon(prepared);
    expect(await h.queue.list(h.scope)).toEqual([]);
    expect(await h.pending.list(h.scope)).toEqual([]);
    expect(trips(h)).toEqual([]);
  });

  it('holds a queued record for review when the trip unit is not TWD, sending nothing', async () => {
    const h = await harness();
    await h.enqueue(1);
    h.hook(async (path) =>
      path.endsWith('/expense-options')
        ? Response.json({ data: { ...options, ledger: { baseCurrency: 'USD', moneyScale: 2 } } })
        : undefined
    );
    await h.queue.synchronize(h.scope);
    expect(await h.queue.list(h.scope)).toMatchObject([
      { status: 'attention', reason: 'currency' },
    ]);
    expect(h.calls.filter((c) => c.path.endsWith('/preview'))).toEqual([]);
    expect(h.server.posts()).toEqual([]);
    expect(await h.pending.list(h.scope)).toEqual([]);
  });
});

it.each(['amount', 'percent', 'shares'] as const)(
  'never synchronizes %s intent, even with equal results',
  async (splitMode) => {
    const h = await harness();
    const d = { ...h.draft(1), input: { ...h.draft(1).input, splitMode } };
    await h.pending.drafts.start(d);
    await expect(h.queue.enqueue(d, options)).rejects.toThrow();
    await h.db.runAsync(
      "INSERT INTO expense_queue (environment, account_id, client_request_id, trip_id, input, roster, status, reason, next_at, created_at, api_version) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, 0, 1, 2)",
      h.scope.environment,
      h.scope.accountId,
      uuidOf(900),
      TRIP,
      JSON.stringify(d.input),
      JSON.stringify([ANN, BOB, CAT])
    );
    await h.enqueue(2, OTHER_TRIP);
    await h.queue.synchronize(h.scope);
    expect((await h.store.list(h.scope)).find((r) => r.tripId === TRIP)).toMatchObject({
      status: 'attention',
    });
    expect(h.calls.some((c) => c.path.includes(TRIP))).toBe(false);
    expect(h.server.expenses).toHaveLength(1);
  }
);

it('can still synchronize an equal draft with the new explicit split capabilities', async () => {
  const h = await harness();
  await h.enqueue(1);
  h.hook(async (path) => {
    if (path.endsWith('/expense-options'))
      return Response.json({
        data: {
          ...options,
          ledger,
          splitPreviewModes: ['equal', 'amount', 'percent', 'shares'],
          splitCreateModes: ['equal', 'amount', 'percent', 'shares'],
        },
      });
    if (path.endsWith('/preview'))
      return Response.json({
        data: {
          ...v2preview,
          splitMode: 'equal',
          splits: preview.splits.map((s) => ({ ...s, originalShareAmount: s.shareAmount })),
        },
      });
  });
  await h.queue.synchronize(h.scope);
  expect(h.server.posts()[0].body).toMatchObject({ split: { mode: 'equal' } });
  expect(h.server.expenses).toHaveLength(1);
  expect(await h.pending.list(h.scope)).toEqual([]);
});
