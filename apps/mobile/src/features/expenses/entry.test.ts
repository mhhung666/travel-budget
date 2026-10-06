import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, type Fetcher } from '@/api/client';
import type { ExpenseDetail } from '@/api/contracts';
import { SessionManager, type CredentialStore } from '@/api/session';
import {
  createPendingExpenseStore,
  type PendingExpenseStore,
  type PendingScope,
} from '@/storage/pendingExpenses';
import { fakeExpenseServer, hex, uuidOf, type Fault } from '@/test/expenseServer';
import { memoryDatabase } from '@/test/sqlite';
import type { ExpenseFields } from './draft';
import { ExpenseEntry, reasonOf, sameExpense, verdictOf, type EntryOutcome } from './entry';

const BASE = 'https://example.test/api/v1';
const [ANN, BOB, CAT] = [hex(1), hex(2), hex(3)];
const [TRIP, OTHER_TRIP] = [hex(100), hex(200)];

const fields = (patch: Partial<ExpenseFields> = {}): ExpenseFields => ({
  payer_id: ANN,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Dinner',
  category: 'food',
  date: '2026-10-04',
  splits: [
    { user_id: ANN, share_amount: 33.34 },
    { user_id: BOB, share_amount: 33.33 },
    { user_id: CAT, share_amount: 33.33 },
  ],
  ...patch,
});
function expectKind<K extends EntryOutcome['kind']>(outcome: EntryOutcome, kind: K) {
  expect(outcome.kind).toBe(kind);
  return outcome as Extract<EntryOutcome, { kind: K }>;
}

const opened: { close(): void }[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));

/** The real SQLite store, the real session manager and API client, and a fake backend. */
async function harness(options: { timeoutMs?: number } = {}) {
  const db = memoryDatabase();
  opened.push(db);
  const server = fakeExpenseServer();
  server.addAccount(ANN, 'ann');
  server.addAccount(BOB, 'bob');
  for (const user of [ANN, BOB, CAT]) server.addMember(TRIP, user);
  server.addMember(OTHER_TRIP, ANN);

  const before: ((method: string, path: string) => Promise<void | Response>)[] = [];
  const fetcher: Fetcher = async (url, init) => {
    for (const hook of before) {
      const response = await hook(init?.method ?? 'GET', new URL(url).pathname);
      if (response instanceof Response) return response;
    }
    return server.fetcher(url, init);
  };
  let token: string | null = null;
  const credentials: CredentialStore = {
    get: async () => token,
    set: async (value) => {
      token = value;
    },
    clear: async () => {
      token = null;
    },
  };
  const manager = new SessionManager(
    new ApiClient('https://example.test', fetcher, options.timeoutMs),
    credentials,
    async () => {}
  );

  const real = await createPendingExpenseStore(db);
  const broken = { open: false, insert: false, remove: 0 };
  const store: PendingExpenseStore = {
    ...real,
    insert: async (record, draft) => {
      if (broken.insert) throw new Error('disk full');
      return real.insert(record, draft);
    },
    remove: async (scope, id, resolution) => {
      if (broken.remove > 0) {
        broken.remove--;
        throw new Error('database is locked');
      }
      return real.remove(scope, id, resolution);
    },
  };
  const committed = vi.fn();
  const changed = vi.fn();
  let ids = 0;
  const makeEntry = () =>
    new ExpenseEntry({
      store: () =>
        broken.open ? Promise.reject(new Error('cannot open')) : Promise.resolve(store),
      request: (userId, path, schema, requestOptions) =>
        manager.requestAs(userId, path, schema, requestOptions),
      newId: () => uuidOf(++ids),
      onCommitted: committed,
      onChange: changed,
    });
  return {
    server,
    manager,
    store,
    broken,
    committed,
    changed,
    entry: makeEntry(),
    makeEntry,
    before: (hook: (method: string, path: string) => Promise<void | Response>) => before.push(hook),
    scope: (accountId: string): PendingScope => ({ environment: manager.api.baseUrl, accountId }),
    login: (name: 'ann' | 'bob') => manager.login(name, 'secret'),
    fail: (
      method: 'GET' | 'POST',
      fault: Fault,
      pattern = method === 'POST' ? /\/expenses$/ : /expense-requests/
    ) => server.fail(method, pattern, fault),
    pending: (accountId = ANN, tripId?: string) =>
      real.list({ environment: manager.api.baseUrl, accountId }, tripId),
  };
}

describe('a confirmed submission', () => {
  it('is saved on the device before it is sent, and removed only when the server confirms', async () => {
    const h = await harness();
    await h.login('ann');
    const saved: Awaited<ReturnType<typeof h.pending>>[] = [];
    h.before(async (method, path) => {
      if (method === 'POST' && path.endsWith('/expenses')) saved.push(await h.pending());
    });

    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');

    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(1);
    expect(saved[0][0]).toMatchObject({
      environment: BASE.replace('/api/v1', ''),
      accountId: ANN,
      tripId: TRIP,
      clientRequestId: uuidOf(1),
      status: 'sending',
    });
    expect(saved[0][0].payload).toEqual({ ...fields(), client_request_id: uuidOf(1) });
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.posts()[0].body).toEqual(saved[0][0].payload);
    expect(h.server.lookups()).toHaveLength(0);
    expect(h.server.expenses).toHaveLength(1);
    expect(outcome.expense).toEqual(h.server.expenses[0]);
    expect(outcome.differs).toBe(false);
    await expect(outcome.refreshed).resolves.toBe(true);
    expect(h.committed).toHaveBeenCalledWith(h.scope(ANN), TRIP, outcome.expense);
    expect(await h.pending()).toEqual([]);
  });

  it('never stores a credential', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'network' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    const stored = JSON.stringify(await h.pending());
    expect(stored).not.toMatch(/access-|refresh-|Bearer/);
  });

  it('is not sent at all when it cannot be saved', async () => {
    const h = await harness();
    await h.login('ann');
    h.broken.insert = true;
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'not-sent');
    expect(h.server.posts()).toHaveLength(0);
    expect(h.server.expenses).toHaveLength(0);
    expect(await h.pending()).toEqual([]);
  });

  it('is not sent when the database cannot be opened', async () => {
    const h = await harness();
    await h.login('ann');
    h.broken.open = true;
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'not-sent');
    expect(h.server.seen.filter((call) => call.path.includes('/trips/'))).toHaveLength(0);
  });

  it('refuses a body that breaks the request contract before saving anything', async () => {
    const h = await harness();
    await h.login('ann');
    expectKind(
      await h.entry.submit(h.scope(ANN), TRIP, fields({ original_amount: -1 })),
      'not-sent'
    );
    expect(await h.pending()).toEqual([]);
    expect(h.server.posts()).toHaveLength(0);
  });

  it('starts only one request for two quick taps', async () => {
    const h = await harness();
    await h.login('ann');
    const [first, second] = await Promise.all([
      h.entry.submit(h.scope(ANN), TRIP, fields()),
      h.entry.submit(h.scope(ANN), TRIP, fields()),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(['blocked', 'saved']);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);
  });

  it('reports the saved-record changes so screens can follow them', async () => {
    const h = await harness();
    await h.login('ann');
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    expect(h.changed.mock.calls).toEqual([
      [h.scope(ANN), TRIP],
      [h.scope(ANN), TRIP],
    ]);
  });
});

describe('an explicit rejection', () => {
  it.each([
    [400, 'VALIDATION_ERROR'],
    [413, 'BODY_TOO_LARGE'],
    [415, 'INVALID_CONTENT_TYPE'],
  ])(
    '%d means nothing was written: the record goes and the user may edit',
    async (status, code) => {
      const h = await harness();
      await h.login('ann');
      h.fail('POST', { kind: 'status', status, code });
      const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'rejected');
      expect(outcome.error).toMatchObject({ status, code });
      expect(await h.pending()).toEqual([]);
      expect(h.server.lookups()).toHaveLength(0);
      // Fixed and confirmed again, it is a new submission with a new id.
      expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');
      expect(
        h.server
          .posts()
          .map((call) => (call.body as { client_request_id: string }).client_request_id)
      ).toEqual([uuidOf(1), uuidOf(2)]);
      expect(h.server.expenses).toHaveLength(1);
    }
  );

  it('is not trusted when it comes from a gateway instead of the API', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'status', status: 400, bare: true });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('not-found');
    expect(await h.pending()).toHaveLength(1);
  });
});

describe('an outcome that is not clear', () => {
  it('finds the expense again when only the response was lost', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(outcome.expense).toEqual(h.server.expenses[0]);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.lookups()).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
  });

  it('keeps the request locked while it cannot be confirmed, and repeats it unchanged', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });

    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('network');
    const [record] = await h.pending();
    expect(record).toMatchObject({ clientRequestId: uuidOf(1), status: 'unconfirmed' });
    expect(h.server.expenses).toHaveLength(1); // it did reach the server

    // The trip is locked: entering the same thing again cannot start a second request.
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'blocked');
    expect(h.server.posts()).toHaveLength(1);
    // Another trip is not affected.
    expectKind(
      await h.entry.submit(h.scope(ANN), OTHER_TRIP, fields({ description: 'Taxi' })),
      'saved'
    );

    const again = expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'saved');
    expect(again.expense).toEqual(h.server.expenses[0]);
    const bodies = h.server.posts().map((call) => call.body);
    expect(bodies[0]).toEqual(bodies[2]); // same id, same body
    expect(h.server.expenses.map((expense) => expense.description)).toEqual(['Dinner', 'Taxi']);
    expect(await h.pending()).toEqual([]);
  });

  it('can be looked up without sending anything again', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    const outcome = expectKind(await h.entry.lookup(h.scope(ANN), uuidOf(1)), 'saved');
    expect(outcome.expense.description).toBe('Dinner');
    expect(h.server.posts()).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
  });

  it.each<[string, Fault]>([
    ['a server error after committing', { kind: 'status', status: 500, after: true }],
    ['an unreadable answer after committing', { kind: 'garbage' }],
  ])('looks up the server after %s', async (_name, fault) => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', fault);
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.lookups()).toHaveLength(1);
  });

  it.each<[string, Fault]>([
    ['a server error before committing', { kind: 'status', status: 503 }],
    ['a failed connection', { kind: 'network' }],
  ])('offers a retry after %s, and the retry writes once', async (_name, fault) => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', fault);
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('not-found');
    expect(h.server.expenses).toHaveLength(0);
    expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(
      h.server.posts().map((call) => (call.body as { client_request_id: string }).client_request_id)
    ).toEqual([uuidOf(1), uuidOf(1)]);
  });

  it('survives a request that hangs until the client timeout', async () => {
    const h = await harness({ timeoutMs: 30 });
    await h.login('ann');
    h.fail('POST', { kind: 'hang' });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('not-found');
    expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'saved');
    expect(h.server.expenses).toHaveLength(1);
  });

  it('reports a timeout when the lookup cannot answer either', async () => {
    const h = await harness({ timeoutMs: 30 });
    await h.login('ann');
    h.fail('POST', { kind: 'hang' });
    h.fail('GET', { kind: 'hang' });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('timeout');
    expect(await h.pending()).toHaveLength(1);
  });

  it('waits for the server on 429 and sends nothing in the meantime', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'status', status: 429, code: 'BUSY', retryAfter: 60 });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('busy');
    expect(h.server.lookups()).toHaveLength(0);
    const early = expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'unconfirmed');
    expect(early.reason).toBe('busy');
    expect(h.server.posts()).toHaveLength(1); // the cooldown held it back locally
    expect(await h.pending()).toHaveLength(1);
  });

  it('uses a durable 30-second fallback when a 429 omits Retry-After', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'status', status: 429, code: 'BUSY' });
    expect(
      expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed').reason
    ).toBe('busy');
    const nextAt = await h.store.retryAt!(h.scope(ANN), uuidOf(1));
    expect(nextAt).toBeGreaterThan(Date.now() + 29_000);
    expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'unconfirmed');
    expect(h.server.posts()).toHaveLength(1);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(nextAt);
    try {
      expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'saved');
    } finally {
      clock.mockRestore();
    }
    expect(h.server.expenses).toHaveLength(1);
  });
});

describe('refusals that prove nothing', () => {
  it('keeps the request when access to the trip is gone, and finds it once access is back', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    let removed = false;
    h.before(async (method) => {
      // Membership is lost after the server committed, before the client's lookup arrives.
      if (method === 'GET' && !removed) {
        removed = true;
        h.server.removeMember(TRIP, ANN);
      }
    });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('access');
    expect(await h.pending()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);

    expect(expectKind(await h.entry.lookup(h.scope(ANN), uuidOf(1)), 'unconfirmed').reason).toBe(
      'access'
    );
    h.server.addMember(TRIP, ANN);
    const found = expectKind(await h.entry.lookup(h.scope(ANN), uuidOf(1)), 'saved');
    expect(found.expense.description).toBe('Dinner');
    expect(await h.pending()).toEqual([]);
    expect(h.server.expenses).toHaveLength(1);
  });

  it('does not call a 404 on the first attempt a failure either', async () => {
    const h = await harness();
    await h.login('ann');
    h.server.removeMember(TRIP, ANN);
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('access');
    expect(await h.pending()).toHaveLength(1);
    expect(h.server.lookups()).toHaveLength(0);
  });

  it('keeps the request when sign-in cannot be refreshed, and resolves it after signing in again', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    h.server.revoke(ANN);

    const outcome = expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'unconfirmed');
    expect(outcome.reason).toBe('unauthorized');
    expect(h.manager.getSnapshot().status).toBe('signedOut');
    expect(await h.pending()).toHaveLength(1);

    h.server.restore(ANN);
    await h.login('ann');
    const recovered = await h.entry.recover(h.scope(ANN));
    expect(recovered.map((entry) => entry.kind)).toEqual(['saved']);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
  });
});

describe('a 409', () => {
  it('finds the original request and never starts another with a new id', async () => {
    const h = await harness();
    await h.login('ann');
    const original: ExpenseDetail = {
      id: hex(777),
      date: '2026-10-01',
      description: 'Something else',
      category: 'other',
      payerId: BOB,
      payerName: 'bob',
      amount: 5,
      originalAmount: 5,
      currency: 'TWD',
      exchangeRate: 1,
      splits: [{ userId: BOB, displayName: 'bob', shareAmount: 5 }],
    };
    h.server.seedReceipt(TRIP, ANN, uuidOf(1), original);
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');
    expect(outcome.expense).toEqual(original);
    expect(outcome.differs).toBe(true);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.lookups()).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
    expect(h.server.expenses).toHaveLength(0);
  });

  it('stays unresolved when the original cannot be found', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'status', status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
    expect(outcome.reason).toBe('conflict');
    expect(await h.pending()).toHaveLength(1);
    expect(h.server.posts()).toHaveLength(1);
  });
});

describe('accounts', () => {
  async function unconfirmedForAnn() {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    expect(await h.pending()).toHaveLength(1);
    return h;
  }
  const switchTo = async (h: Awaited<ReturnType<typeof harness>>, name: 'ann' | 'bob') => {
    await h.manager.logout();
    await h.login(name);
  };

  it('never shows, looks up or sends one account’s request to another account of the same trip', async () => {
    const h = await unconfirmedForAnn();
    await switchTo(h, 'bob');
    h.server.seen.length = 0;

    expect(await h.entry.list(h.scope(BOB), TRIP)).toEqual([]);
    expect(await h.entry.recover(h.scope(BOB))).toEqual([]);
    expectKind(await h.entry.lookup(h.scope(BOB), uuidOf(1)), 'gone');
    expectKind(await h.entry.retry(h.scope(BOB), uuidOf(1)), 'gone');
    expect(
      h.server.seen.filter(
        (call) => call.path.includes('/expenses') || call.path.includes('/expense-requests')
      )
    ).toEqual([]);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.pending()).toHaveLength(1);
  });

  it('does not send for an account that is no longer signed in, whatever its token would allow', async () => {
    const h = await unconfirmedForAnn();
    await switchTo(h, 'bob');
    h.server.seen.length = 0;
    // Even a call that names Ann's request cannot go out with Bob's token.
    expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'unconfirmed');
    expect(h.server.seen.filter((call) => call.path.includes('/expense'))).toEqual([]);
    const forced = expectKind(
      await h.entry.submit(h.scope(ANN), OTHER_TRIP, fields()),
      'unconfirmed'
    );
    expect(forced.reason).toBe('cancelled');
    expect(h.server.seen.filter((call) => call.path.includes('/expense'))).toEqual([]);
  });

  it('lets the same account carry on after another account used the app', async () => {
    const h = await unconfirmedForAnn();
    await switchTo(h, 'bob');
    expectKind(
      await h.entry.submit(
        h.scope(BOB),
        TRIP,
        fields({ payer_id: BOB, description: 'Bob’s taxi' })
      ),
      'saved'
    );
    await switchTo(h, 'ann');
    const recovered = await h.entry.recover(h.scope(ANN));
    expect(recovered.map((entry) => entry.kind)).toEqual(['saved']);
    expect(h.server.expenses.map((expense) => expense.description)).toEqual([
      'Dinner',
      'Bob’s taxi',
    ]);
    expect(await h.pending()).toEqual([]);
    expect(await h.pending(BOB)).toEqual([]);
  });

  it('keeps the request when the answer arrives after the account changed', async () => {
    const h = await harness();
    await h.login('ann');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    h.before(async (method, path) => {
      if (!held && method === 'POST' && path.endsWith('/expenses')) {
        held = true;
        await gate;
      }
    });
    const submitting = h.entry.submit(h.scope(ANN), TRIP, fields());
    await vi.waitFor(() => expect(held).toBe(true));
    await switchTo(h, 'bob');
    release();
    const outcome = expectKind(await submitting, 'unconfirmed');
    expect(outcome.reason).toBe('cancelled');
    expect(await h.pending()).toHaveLength(1);
    expect(await h.pending(BOB)).toEqual([]);
    expect(await h.entry.list(h.scope(BOB), TRIP)).toEqual([]);

    await switchTo(h, 'ann');
    expect((await h.entry.recover(h.scope(ANN))).map((entry) => entry.kind)).toEqual(['saved']);
    expect(h.server.expenses).toHaveLength(1);
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [413, 'BODY_TOO_LARGE'],
    [404, 'NOT_FOUND'],
    [500, 'SERVER_ERROR'],
  ])(
    'keeps the request when a %d arrives after the account changed, however final it sounds',
    async (status, code) => {
      const h = await harness();
      await h.login('ann');
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let held = false;
      h.before(async (method, path) => {
        if (!held && method === 'POST' && path.endsWith('/expenses')) {
          held = true;
          await gate;
        }
      });
      h.fail('POST', { kind: 'status', status, code });
      const submitting = h.entry.submit(h.scope(ANN), TRIP, fields());
      await vi.waitFor(() => expect(held).toBe(true));
      await switchTo(h, 'bob');
      h.changed.mockClear();
      release();
      // Not "rejected": a refusal for a session that is gone proves nothing about the request.
      const outcome = expectKind(await submitting, 'unconfirmed');
      expect(outcome.reason).toBe('cancelled');
      expect(await h.pending()).toHaveLength(1);
      expect(h.changed).not.toHaveBeenCalled();
      expect(await h.pending(BOB)).toEqual([]);

      // Back as Ann the same request is still there, and only it can be repeated.
      await switchTo(h, 'ann');
      const [found] = await h.entry.recover(h.scope(ANN));
      expect(found).toMatchObject({ kind: 'unconfirmed', reason: 'not-found' });
      expectKind(await h.entry.retry(h.scope(ANN), uuidOf(1)), 'saved');
      expect(h.server.expenses).toHaveLength(1);
      expect(await h.pending()).toEqual([]);
    }
  );
});

describe('recovery', () => {
  it('finds a request that was committed before the app was closed', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());

    const restarted = h.makeEntry(); // a new process: nothing in memory, only the saved record
    const outcomes = await restarted.recover(h.scope(ANN));
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['saved']);
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.posts()).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
    expect(h.committed).toHaveBeenCalledOnce();
  });

  it('only asks the server; a request that is not there stays for the user to repeat', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'network' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    const restarted = h.makeEntry();
    const outcomes = await restarted.recover(h.scope(ANN));
    expect(outcomes).toEqual([
      { kind: 'unconfirmed', clientRequestId: uuidOf(1), reason: 'not-found' },
    ]);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(0);
    // The repeat reads the saved record: same id and same body as before the restart.
    expectKind(await restarted.retry(h.scope(ANN), uuidOf(1)), 'saved');
    const [first, second] = h.server.posts();
    expect(second.body).toEqual(first.body);
    expect(h.server.expenses).toHaveLength(1);
  });

  it('runs once at a time and covers every trip', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), OTHER_TRIP, fields({ description: 'Taxi' }));
    h.server.seen.length = 0;
    const [one, two] = await Promise.all([
      h.entry.recover(h.scope(ANN)),
      h.entry.recover(h.scope(ANN)),
    ]);
    expect(one).toBe(two);
    expect(h.server.lookups()).toHaveLength(2);
    expect(await h.pending()).toEqual([]);
  });

  it('does nothing when the database cannot be opened', async () => {
    const h = await harness();
    await h.login('ann');
    h.broken.open = true;
    expect(await h.entry.recover(h.scope(ANN))).toEqual([]);
  });
});

describe('concurrent operations on one request', () => {
  it('run one after another, so a lookup never races its retry', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'network' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    h.server.seen.length = 0;
    const [retried, looked] = await Promise.all([
      h.entry.retry(h.scope(ANN), uuidOf(1)),
      h.entry.lookup(h.scope(ANN), uuidOf(1)),
    ]);
    expect(retried.kind).toBe('saved');
    expect(looked.kind).toBe('gone');
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.lookups()).toHaveLength(0);
    expect(h.server.expenses).toHaveLength(1);
  });

  it('send a request that was already settled only once', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'network' });
    h.fail('GET', { kind: 'network' });
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    h.server.seen.length = 0;
    const results = await Promise.all([
      h.entry.retry(h.scope(ANN), uuidOf(1)),
      h.entry.retry(h.scope(ANN), uuidOf(1)),
      h.entry.retry(h.scope(ANN), uuidOf(1)),
    ]);
    expect(results.map((result) => result.kind)).toEqual(['saved', 'gone', 'gone']);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);
  });
});

describe('a confirmed request whose record cannot be removed', () => {
  it('is saved, hidden, cleaned up later, and never created again', async () => {
    const h = await harness();
    await h.login('ann');
    h.broken.remove = 1;
    const outcome = expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'saved');
    expect(outcome.expense).toEqual(h.server.expenses[0]);
    expect(await h.pending()).toHaveLength(1); // still on disk
    expect(await h.entry.list(h.scope(ANN), TRIP)).toEqual([]); // but not shown, and removed now
    expect(await h.pending()).toEqual([]);
    expect(h.server.posts()).toHaveLength(1);
  });

  it('is looked up again after a restart instead of being sent again', async () => {
    const h = await harness();
    await h.login('ann');
    h.broken.remove = 1;
    await h.entry.submit(h.scope(ANN), TRIP, fields());
    expect(await h.pending()).toHaveLength(1);

    const restarted = h.makeEntry();
    expect((await restarted.recover(h.scope(ANN))).map((entry) => entry.kind)).toEqual(['saved']);
    expect(h.server.posts()).toHaveLength(1);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.pending()).toEqual([]);
  });

  it('keeps a refused request visible until its removal works', async () => {
    const h = await harness();
    await h.login('ann');
    h.fail('POST', { kind: 'status', status: 400, code: 'VALIDATION_ERROR' });
    h.broken.remove = 1;
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'rejected');
    expect(await h.entry.list(h.scope(ANN), TRIP)).toEqual([]);
    expect(await h.pending()).toEqual([]);
  });
});

describe('what a failure proves', () => {
  const api = (status: number, code = 'X') => new ApiError(code, status);
  it.each([
    [api(400, 'VALIDATION_ERROR'), 'rejected'],
    [api(413, 'BODY_TOO_LARGE'), 'rejected'],
    [api(415, 'INVALID_CONTENT_TYPE'), 'rejected'],
    [api(422, 'SOMETHING'), 'rejected'],
    [api(400, 'SERVER_ERROR'), 'uncertain'],
    [api(409, 'IDEMPOTENCY_CONFLICT'), 'conflict'],
    [new ApiError('CONFLICT', 409, undefined, 'refresh'), 'refused'],
    [api(401, 'UNAUTHORIZED'), 'refused'],
    [api(403, 'FORBIDDEN'), 'refused'],
    [api(404, 'NOT_FOUND'), 'refused'],
    [api(429, 'BUSY'), 'refused'],
    [api(500, 'INTERNAL_ERROR'), 'uncertain'],
    [api(502, 'SERVER_ERROR'), 'uncertain'],
    [api(503, 'X'), 'uncertain'],
    [new ApiError('NETWORK'), 'uncertain'],
    [new ApiError('TIMEOUT'), 'uncertain'],
    [new ApiError('INVALID_RESPONSE'), 'uncertain'],
    [new ApiError('CANCELLED'), 'uncertain'],
    [new Error('anything'), 'uncertain'],
  ])('%o is %s', (error, verdict) => {
    expect(verdictOf(error)).toBe(verdict);
  });
  it.each([
    [new ApiError('NETWORK'), 'network'],
    [new ApiError('TIMEOUT'), 'timeout'],
    [new ApiError('CANCELLED'), 'cancelled'],
    [api(409), 'conflict'],
    [new ApiError('CONFLICT', 409, undefined, 'refresh'), 'server'],
    [new ApiError('NOT_FOUND', 404, undefined, 'refresh'), 'server'],
    [new ApiError('RATE_LIMITED', 429, 10, 'refresh'), 'busy'],
    [new ApiError('NETWORK', 0, undefined, 'refresh'), 'network'],
    [api(429), 'busy'],
    [api(401), 'unauthorized'],
    [api(403), 'access'],
    [api(404), 'access'],
    [api(500), 'server'],
    [new Error('x'), 'server'],
  ])('reports %o as %s', (error, reason) => {
    expect(reasonOf(error)).toBe(reason);
  });
});

describe('comparing the stored expense with what was entered', () => {
  const stored = (patch: Partial<ExpenseDetail> = {}): ExpenseDetail => ({
    id: hex(5),
    date: '2026-10-04',
    description: 'Dinner',
    category: 'food',
    payerId: ANN,
    payerName: 'ann',
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    splits: [
      { userId: CAT, displayName: 'cat', shareAmount: 33.33 },
      { userId: ANN, displayName: 'ann', shareAmount: 33.34 },
      { userId: BOB, displayName: 'bob', shareAmount: 33.33 },
    ],
    ...patch,
  });
  const payload = { ...fields(), client_request_id: uuidOf(1) };
  it('ignores split order and names', () => {
    expect(sameExpense(payload, stored())).toBe(true);
  });
  it.each<[string, Partial<ExpenseDetail>]>([
    ['description', { description: 'Lunch' }],
    ['date', { date: '2026-10-05' }],
    ['category', { category: 'other' }],
    ['payer', { payerId: BOB }],
    ['amount', { amount: 100.01 }],
    ['a share', { splits: [{ userId: ANN, displayName: 'ann', shareAmount: 100 }] }],
  ])('notices a different %s', (_name, patch) => {
    expect(sameExpense(payload, stored(patch))).toBe(false);
  });
});

describe('refresh failures do not reject pending expenses', () => {
  it.each([400, 413, 415])(
    'keeps a committed request after refresh %s and recovers the original expense',
    async (status) => {
      const h = await harness();
      await h.login('ann');
      h.fail('POST', { kind: 'drop-response' });
      h.fail('GET', { kind: 'network' });
      expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
      const [pending] = await h.pending();
      expect(h.server.expenses).toHaveLength(1);
      h.fail('POST', { kind: 'status', status: 401, code: 'UNAUTHORIZED' });
      h.before(async (_method, path) => {
        if (path.endsWith('/auth/refresh'))
          return Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status });
      });
      const outcome = expectKind(
        await h.entry.retry(h.scope(ANN), pending.clientRequestId),
        'unconfirmed'
      );
      expect(outcome.reason).toBe('server');
      expect(await h.pending()).toEqual([
        expect.objectContaining({
          clientRequestId: pending.clientRequestId,
          payload: pending.payload,
        }),
      ]);
      expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'blocked');
      expect(h.server.posts()).toHaveLength(2);
      await h.login('ann');
      const recovered = expectKind(
        await h.entry.lookup(h.scope(ANN), pending.clientRequestId),
        'saved'
      );
      expect(recovered.expense.id).toBe(h.server.expenses[0].id);
      expect(h.server.expenses).toHaveLength(1);
      expect(await h.pending()).toEqual([]);
    }
  );

  it('keeps A’s record when its refresh 400 arrives after B signed in', async () => {
    const h = await harness();
    await h.login('ann');
    let release!: () => void;
    let started!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.fail('POST', { kind: 'status', status: 401, code: 'UNAUTHORIZED' });
    h.before(async (_method, path) => {
      if (path.endsWith('/auth/refresh')) {
        started();
        await held;
        return Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 });
      }
    });
    const posting = h.entry.submit(h.scope(ANN), TRIP, fields());
    await entered;
    const [pending] = await h.pending();
    await h.login('bob');
    release();
    const outcome = expectKind(await posting, 'unconfirmed');
    expect(outcome.reason).toBe('cancelled');
    expect(await h.pending()).toEqual([
      expect.objectContaining({
        clientRequestId: pending.clientRequestId,
        payload: pending.payload,
      }),
    ]);
    expect(await h.pending(BOB)).toEqual([]);
    expect(h.manager.getSnapshot().user?.id).toBe(BOB);
    expect(h.committed).not.toHaveBeenCalled();
    expect(h.server.posts()).toHaveLength(1);
  });
});

describe('D1 hands a durable draft to C', () => {
  const raw = {
    description: '  Dinner  ',
    amountText: '100.00',
    date: '2026-10-04',
    category: 'food' as const,
    payerId: ANN,
    memberIds: [ANN, BOB, CAT],
  };
  const saveDraft = async (h: Awaited<ReturnType<typeof harness>>) => {
    const draft = {
      ...h.scope(ANN),
      tripId: TRIP,
      draftId: uuidOf(100),
      revision: 3,
      updatedAt: 1000,
      input: raw,
    };
    await h.store.drafts.start(draft);
    return draft;
  };
  it('hands off atomically before HTTP, then success retires the source draft', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    h.before(async (method, path) => {
      if (method === 'POST' && path.endsWith('/expenses')) {
        expect(await h.pending()).toHaveLength(1);
        await expect(h.store.drafts.load(h.scope(ANN), TRIP)).rejects.toThrow('DRAFT_HANDED_OFF');
      }
    });
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields(), draft), 'saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.store.drafts.load(h.scope(ANN), TRIP)).toBeNull();
    expect(await h.store.drafts.save({ ...draft, revision: 99 })).toBe(false);
  });
  it('handoff failure sends no HTTP and keeps the editable raw draft', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    h.broken.insert = true;
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields(), draft), 'not-sent');
    expect(h.server.posts()).toHaveLength(0);
    expect(await h.store.drafts.load(h.scope(ANN), TRIP)).toEqual(draft);
  });
  it('definite rejection restores exactly the raw input under a new revision', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    h.fail('POST', { kind: 'status', status: 400, code: 'VALIDATION_ERROR' });
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields(), draft), 'rejected');
    const restored = await h.store.drafts.load(h.scope(ANN), TRIP);
    expect(restored).toEqual({ ...draft, revision: 4 });
    expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields(), restored!), 'saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(
      h.server.posts().map((call) => (call.body as { client_request_id: string }).client_request_id)
    ).toEqual([uuidOf(1), uuidOf(2)]);
  });
  it('crash after local handoff before HTTP resumes only the same frozen UUID', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    const payload = { ...fields(), client_request_id: uuidOf(999) };
    await h.store.insert(
      {
        ...h.scope(ANN),
        tripId: TRIP,
        clientRequestId: uuidOf(999),
        payload,
        status: 'sending',
        createdAt: 1000,
        updatedAt: 1000,
      },
      draft
    );
    const restarted = h.makeEntry();
    expect((await restarted.recover(h.scope(ANN)))[0].kind).toBe('unconfirmed');
    expect(h.server.posts()).toHaveLength(0);
    expectKind(await restarted.submit(h.scope(ANN), TRIP, fields(), draft), 'blocked');
    expectKind(await restarted.retry(h.scope(ANN), uuidOf(999)), 'saved');
    expect(h.server.posts()[0].body).toEqual(payload);
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.store.drafts.load(h.scope(ANN), TRIP)).toBeNull();
  });
  it('server commit followed by a lost response and restart never creates a second expense', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    h.fail('POST', { kind: 'drop-response' });
    h.fail('GET', { kind: 'network' });
    const outcome = expectKind(
      await h.entry.submit(h.scope(ANN), TRIP, fields(), draft),
      'unconfirmed'
    );
    await expect(h.store.drafts.load(h.scope(ANN), TRIP)).rejects.toThrow('DRAFT_HANDED_OFF');
    const restarted = h.makeEntry();
    expectKind(await restarted.retry(h.scope(ANN), outcome.clientRequestId), 'saved');
    await restarted.recover(h.scope(ANN));
    expect(h.server.expenses).toHaveLength(1);
    expect(h.server.posts()).toHaveLength(2);
    expect(h.server.posts()[0].body).toEqual(h.server.posts()[1].body);
    expect(await h.store.drafts.load(h.scope(ANN), TRIP)).toBeNull();
  });
  it('changing accounts after handoff retains A’s draft/request without using B’s credentials', async () => {
    const h = await harness();
    await h.login('ann');
    const draft = await saveDraft(h);
    let release!: () => void;
    let started!: () => void;
    const reached = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.before(async (method, path) => {
      if (method === 'POST' && path.endsWith('/expenses')) {
        started();
        await blocked;
      }
    });
    const sending = h.entry.submit(h.scope(ANN), TRIP, fields(), draft);
    await reached;
    await h.login('bob');
    release();
    expectKind(await sending, 'unconfirmed');
    expect(await h.store.drafts.load(h.scope(BOB), TRIP)).toBeNull();
    expect(await h.pending(BOB)).toEqual([]);
    await expect(h.store.drafts.load(h.scope(ANN), TRIP)).rejects.toThrow('DRAFT_HANDED_OFF');
    await h.login('ann');
    const outcomes = await h.makeEntry().recover(h.scope(ANN));
    expect(outcomes[0].kind).toBe('saved');
    expect(h.server.expenses).toHaveLength(1);
    expect(await h.store.drafts.load(h.scope(ANN), TRIP)).toBeNull();
  });
});

it('holds new C submissions on other trips behind the persistent account rate limit', async () => {
  const h = await harness();
  await h.login('ann');
  h.fail('POST', { kind: 'status', status: 429, code: 'BUSY', retryAfter: 120 });
  expectKind(await h.entry.submit(h.scope(ANN), TRIP, fields()), 'unconfirmed');
  // No D3 queue row exists for this source; a new engine must still enforce its deadline.
  const entry = h.makeEntry();
  const result = expectKind(await entry.submit(h.scope(ANN), OTHER_TRIP, fields()), 'unconfirmed');
  expect(result.reason).toBe('busy');
  expect(h.server.posts()).toHaveLength(1);
  expect(h.server.lookups()).toHaveLength(0);
  expect(await h.pending()).toHaveLength(2);
});
