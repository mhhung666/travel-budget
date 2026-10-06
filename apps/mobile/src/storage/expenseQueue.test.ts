import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hex, uuidOf } from '@/test/expenseServer';
import { memoryDatabase } from '@/test/sqlite';
import { createPendingExpenseStore, type SqlDatabase } from './pendingExpenses';
import { createExpenseQueueStore } from './expenseQueue';
import { createDraftTripStore } from './draftTrips';
import type { StoredExpenseDraft } from './expenseDrafts';
import { confirmedFields } from '@/features/expenses/draft';

declare const process: { execPath: string };
const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const options = { members: [{ id: hex(1), displayName: 'Ann' }], categories: ['food' as const] };
const draft = (n = 1): StoredExpenseDraft => ({
  ...scope,
  tripId,
  draftId: uuidOf(n),
  revision: 1,
  updatedAt: 1000,
  input: {
    description: 'Dinner',
    amountText: '100',
    payerId: hex(1),
    memberIds: [hex(1)],
    date: '2026-10-05',
    category: 'food',
  },
});
const preview = { amount: 100, splits: [{ userId: hex(1), displayName: 'Ann', shareAmount: 100 }] };
const payload = (id: string) => ({
  ...confirmedFields(draft().input, options, preview),
  client_request_id: id,
});
const opened: (SqlDatabase & { close(): void })[] = [];
const dirs: string[] = [];
const open = (path?: string) => {
  const db = memoryDatabase(path);
  opened.push(db);
  return db;
};
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const failAt = (db: SqlDatabase, pattern: RegExp): SqlDatabase => ({
  ...db,
  runAsync: async (sql, ...params) => {
    if (pattern.test(sql)) throw new Error('disk full');
    return db.runAsync(sql, ...params);
  },
});
async function setup(db = open()) {
  const pending = await createPendingExpenseStore(db);
  const queue = await createExpenseQueueStore(db);
  await pending.drafts.start(draft());
  await queue.enqueue(draft(), options, uuidOf(100));
  const record = (await queue.list(scope))[0];
  return { db, pending, queue, record };
}
it('upgrades schema 3 with drafts, pending and trip snapshots intact', async () => {
  const h = await setup();
  await h.queue.discard(h.record);
  await h.pending.drafts.start(draft(2));
  await h.pending.insert({
    ...scope,
    tripId: hex(200),
    clientRequestId: uuidOf(200),
    payload: payload(uuidOf(200)),
    status: 'unconfirmed',
    createdAt: 1000,
    updatedAt: 1000,
  });
  const trips = await createDraftTripStore(h.db);
  await trips.rememberOptions(scope, tripId, options, 1000);
  await h.db.execAsync(
    'DROP TABLE expense_queue; DROP TABLE expense_rate_limit; PRAGMA user_version = 3'
  );
  const queue = await createExpenseQueueStore(h.db);
  expect(await queue.list(scope)).toEqual([]);
  expect((await h.pending.drafts.load(scope, tripId))?.draftId).toBe(uuidOf(2));
  expect(await h.pending.list(scope)).toHaveLength(1);
  expect((await trips.get(scope, tripId))?.options).toEqual(options);
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 6 });
});
it('isolates queue operations by environment and account', async () => {
  const h = await setup();
  for (const other of [
    { ...scope, accountId: hex(2) },
    { ...scope, environment: 'https://b.test' },
  ]) {
    expect(await h.queue.list(other)).toEqual([]);
    await expect(h.queue.discard({ ...h.record, ...other })).rejects.toThrow();
    await expect(h.queue.restore({ ...h.record, ...other }, uuidOf(999))).rejects.toThrow();
    await h.queue.pause({ ...h.record, ...other }, 'access', 0, true);
    expect(
      await h.queue.prepare({ ...h.record, ...other }, payload(h.record.clientRequestId))
    ).toBe(false);
  }
  expect(await h.queue.list(scope)).toMatchObject([{ status: 'queued', reason: null }]);
});
it('tombstones the source in the same transaction and fences late saves and double confirm', async () => {
  const h = await setup();
  expect(await h.pending.drafts.save({ ...draft(), revision: 999 })).toBe(false);
  await expect(h.queue.enqueue(draft(), options, uuidOf(101))).rejects.toThrow('DRAFT_CHANGED');
  await expect(h.pending.drafts.start(draft())).rejects.toThrow();
  await h.pending.drafts.start(draft(2));
  await h.queue.enqueue(draft(2), options, uuidOf(101));
  expect(await h.queue.list(scope)).toHaveLength(2);
});
it.each([/INSERT INTO expense_queue/, /UPDATE expense_draft/])(
  'rolls back queue confirmation at %s, keeping raw inputs editable',
  async (pattern) => {
    const db = open();
    const pending = await createPendingExpenseStore(db);
    await pending.drafts.start(draft());
    const broken = await createExpenseQueueStore(failAt(db, pattern));
    await expect(broken.enqueue(draft(), options, uuidOf(100))).rejects.toThrow('disk full');
    expect(await broken.list(scope)).toEqual([]);
    expect(await pending.drafts.load(scope, tripId)).toEqual(draft());
  }
);
it.each([/INSERT INTO pending_expense/, /UPDATE expense_queue/])(
  'rolls back frozen handoff at %s, leaving no pending write',
  async (pattern) => {
    const h = await setup();
    const broken = await createExpenseQueueStore(failAt(h.db, pattern));
    await expect(broken.prepare(h.record, payload(h.record.clientRequestId))).rejects.toThrow(
      'disk full'
    );
    expect(await h.pending.list(scope)).toEqual([]);
    expect(await h.queue.list(scope)).toMatchObject([{ status: 'queued' }]);
  }
);
it('locks editing and discarding after prepare, including with an old queued UI record', async () => {
  const h = await setup();
  await h.queue.prepare(h.record, payload(h.record.clientRequestId));
  await expect(h.queue.discard(h.record)).rejects.toThrow('QUEUE_IMMUTABLE');
  await expect(h.queue.restore(h.record, uuidOf(900))).rejects.toThrow('QUEUE_IMMUTABLE');
  expect(await h.queue.prepare(h.record, payload(h.record.clientRequestId))).toBe(false);
  expect(await h.pending.list(scope)).toHaveLength(1);
});
it('does not prepare an entry concurrently discarded or restored', async () => {
  const h = await setup();
  await h.queue.restore(h.record, uuidOf(900));
  expect(await h.queue.prepare(h.record, payload(h.record.clientRequestId))).toBe(false);
  expect((await h.pending.drafts.load(scope, tripId))?.input).toEqual(h.record.input);
  expect(await h.pending.list(scope)).toEqual([]);
});
it('restoring does not overwrite a newer raw draft or duplicate an unresolved request', async () => {
  const h = await setup();
  await h.pending.drafts.start(draft(2));
  await expect(h.queue.restore(h.record, uuidOf(900))).rejects.toThrow('DRAFT_BLOCKED');
  expect((await h.pending.drafts.load(scope, tripId))?.draftId).toBe(uuidOf(2));
  expect(await h.queue.list(scope)).toHaveLength(1);
});
it('atomically removes a committed queued record with C; rejection returns to review without losing input', async () => {
  const h = await setup();
  await h.queue.prepare(h.record, payload(h.record.clientRequestId));
  await h.pending.remove(scope, h.record.clientRequestId, 'rejected');
  expect(await h.pending.list(scope)).toEqual([]);
  expect(await h.queue.list(scope)).toMatchObject([
    { status: 'attention', reason: 'rejected', input: h.record.input },
  ]);
  await h.queue.restore((await h.queue.list(scope))[0], uuidOf(900));
  const restored = (await h.pending.drafts.load(scope, tripId))!;
  await h.queue.enqueue(restored, options, uuidOf(101));
  const r = (await h.queue.list(scope))[0];
  await h.queue.prepare(r, payload(r.clientRequestId));
  await h.pending.remove(scope, r.clientRequestId);
  expect(await h.queue.list(scope)).toEqual([]);
  expect(await h.pending.list(scope)).toEqual([]);
  expect(await h.pending.drafts.load(scope, tripId)).toBeNull();
});
it('rolls back failed C cleanup, retaining both immutable records for receipt lookup', async () => {
  const h = await setup();
  await h.queue.prepare(h.record, payload(h.record.clientRequestId));
  const broken = await createPendingExpenseStore(failAt(h.db, /DELETE FROM pending_expense/));
  await expect(broken.remove(scope, h.record.clientRequestId)).rejects.toThrow('disk full');
  expect(await h.pending.list(scope)).toHaveLength(1);
  expect(await h.queue.list(scope)).toMatchObject([{ status: 'prepared' }]);
});
it('does not replace a frozen UUID with a different ID', async () => {
  const h = await setup();
  await expect(h.queue.prepare(h.record, payload(uuidOf(999)))).rejects.toThrow('QUEUE_ID_CHANGED');
  expect(await h.pending.list(scope)).toEqual([]);
});
it.each([
  'enqueue-before-commit',
  'enqueue-after-commit',
  'prepare-before-commit',
  'prepare-after-commit',
] as const)('survives abrupt process exit at %s', async (point) => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-queue-crash-'));
  dirs.push(dir);
  const path = join(dir, 'expense.db');
  const db = open(path);
  const pending = await createPendingExpenseStore(db);
  const queue = await createExpenseQueueStore(db);
  await pending.drafts.start(draft());
  const preparing = point.startsWith('prepare');
  if (preparing) await queue.enqueue(draft(), options, uuidOf(100));
  db.close();
  opened.splice(opened.indexOf(db), 1);
  const sql = preparing
    ? "INSERT INTO pending_expense VALUES (?, ?, ?, ?, ?, 'sending', ?, ?);"
    : "INSERT INTO expense_queue (environment, account_id, client_request_id, trip_id, input, roster, status, reason, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, 0, ?);";
  const params = preparing
    ? [
        scope.environment,
        scope.accountId,
        uuidOf(100),
        tripId,
        JSON.stringify(payload(uuidOf(100))),
        1000,
        1000,
      ]
    : [
        scope.environment,
        scope.accountId,
        uuidOf(100),
        tripId,
        JSON.stringify(draft().input),
        JSON.stringify([hex(1)]),
        1000,
      ];
  const child = spawnSync(process.execPath, [
    '-e',
    `const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(${JSON.stringify(path)}); db.exec('BEGIN IMMEDIATE'); db.prepare(${JSON.stringify(sql)}).run(...${JSON.stringify(params)}); db.exec(${JSON.stringify(preparing ? "UPDATE expense_queue SET status = 'prepared'" : "UPDATE expense_draft SET status = 'discarded', input = '{}' ")}); ${point.endsWith('after-commit') ? "db.exec('COMMIT');" : ''} process.exit(0);`,
  ]);
  expect(child.status, child.stderr.toString()).toBe(0);
  const recovered = open(path);
  const p = await createPendingExpenseStore(recovered);
  const q = await createExpenseQueueStore(recovered);
  const committed = point.endsWith('after-commit');
  expect(await p.list(scope)).toHaveLength(preparing && committed ? 1 : 0);
  if (preparing)
    expect(await q.list(scope)).toMatchObject([
      { status: committed ? 'prepared' : 'queued', clientRequestId: uuidOf(100) },
    ]);
  else {
    expect(await q.list(scope)).toHaveLength(committed ? 1 : 0);
    expect(await p.drafts.load(scope, tripId)).toEqual(committed ? null : draft());
  }
});

it('only discards an existing raw draft when explicitly requested, fencing its late saves', async () => {
  const h = await setup();
  const newer = draft(2);
  await h.pending.drafts.start(newer);
  await expect(h.queue.restore(h.record, uuidOf(900))).rejects.toThrow('DRAFT_BLOCKED');
  await h.queue.restore(h.record, uuidOf(900), true);
  expect((await h.pending.drafts.load(scope, tripId))?.draftId).toBe(uuidOf(900));
  expect(await h.pending.drafts.save({ ...newer, revision: 999 })).toBe(false);
});
it('explicit discard of a current draft cannot replace a handed-off or unconfirmed expense', async () => {
  const h = await setup();
  await h.pending.drafts.start(draft(2));
  const id = uuidOf(200);
  await h.pending.insert(
    {
      ...scope,
      tripId,
      clientRequestId: id,
      payload: payload(id),
      status: 'sending',
      createdAt: 1000,
      updatedAt: 1000,
    },
    draft(2)
  );
  await expect(h.queue.restore(h.record, uuidOf(900), true)).rejects.toThrow('DRAFT_BLOCKED');
  expect(await h.pending.list(scope)).toHaveLength(1);
  expect(await h.queue.list(scope)).toHaveLength(1);
});
it('cannot reuse a queue record identifier to mutate another trip', async () => {
  const h = await setup();
  const other = { ...h.record, tripId: hex(200) };
  expect(await h.queue.prepare(other, payload(other.clientRequestId))).toBe(false);
  await expect(h.queue.restore(other, uuidOf(900))).rejects.toThrow('QUEUE_CHANGED');
  await expect(h.queue.discard(other)).rejects.toThrow('QUEUE_CHANGED');
  expect(await h.queue.list(scope)).toHaveLength(1);
  expect(await h.pending.list(scope)).toEqual([]);
});

it.each(['busy', 'conflict', 'pending'])(
  'upgrades schema 4 with %s waits and frozen records intact',
  async (reason) => {
    const h = await setup();
    await h.queue.prepare(h.record, payload(h.record.clientRequestId));
    await h.queue.pause(h.record, reason, 120_000);
    const frozen = await h.pending.list(scope);
    await h.db.execAsync(
      'ALTER TABLE expense_queue DROP COLUMN rate_limit_until; DROP TABLE expense_rate_limit; PRAGMA user_version = 4'
    );
    const upgraded = await createExpenseQueueStore(h.db);
    expect(await upgraded.list(scope)).toMatchObject([
      {
        ...h.record,
        status: 'prepared',
        reason,
        nextAt: 120_000,
        rateLimitUntil: reason === 'pending' ? 0 : 120_000,
      },
    ]);
    expect(await h.pending.list(scope)).toEqual(frozen);
    expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 6 });
  }
);

it('rolls back a failed schema 4 wait migration and safely retries without losing data', async () => {
  const h = await setup();
  await h.queue.prepare(h.record, payload(h.record.clientRequestId));
  await h.queue.pause(h.record, 'conflict', 120_000);
  await h.db.execAsync(
    'ALTER TABLE expense_queue DROP COLUMN rate_limit_until; DROP TABLE expense_rate_limit; PRAGMA user_version = 4'
  );
  const broken: SqlDatabase = {
    ...h.db,
    execAsync: async (sql) => {
      await h.db.execAsync(sql);
      if (sql.includes('ADD COLUMN rate_limit_until')) throw new Error('disk full');
    },
  };
  await expect(createExpenseQueueStore(broken)).rejects.toThrow('disk full');
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
  const upgraded = await createExpenseQueueStore(h.db);
  expect(await upgraded.list(scope)).toMatchObject([
    { status: 'prepared', reason: 'conflict', rateLimitUntil: 120_000 },
  ]);
  expect(await h.pending.list(scope)).toHaveLength(1);
});

it.each(['queue', 'pending'] as const)(
  'keeps a conflict and rate limit independently via the %s store',
  async (writer) => {
    const h = await setup();
    await h.queue.prepare(h.record, payload(h.record.clientRequestId));
    const pause = (reason: string, deadline: number) =>
      writer === 'queue'
        ? h.queue.pause(h.record, reason, deadline)
        : h.pending.pause!(scope, h.record.clientRequestId, reason, deadline);
    await pause('conflict', 30_000);
    expect(await h.queue.list(scope)).toMatchObject([
      { reason: 'conflict', nextAt: 30_000, rateLimitUntil: 0 },
    ]);
    await pause('busy', 120_000);
    await pause('conflict', 60_000);
    await pause('busy', 90_000);
    expect(await h.queue.list(scope)).toMatchObject([
      { reason: 'conflict', nextAt: 120_000, rateLimitUntil: 120_000 },
    ]);
  }
);

it.each(['queue', 'pending'] as const)(
  'keeps account deadlines isolated and monotonic via %s, independently of row cleanup',
  async (writer) => {
    const h = await setup();
    const pause = (reason: string, until: number) =>
      writer === 'queue'
        ? h.queue.pause(h.record, reason, until)
        : h.pending.pause!(scope, h.record.clientRequestId, reason, until);
    // C also persists limits without a matching prepared queue row.
    await pause('busy', 120_000);
    await pause('busy', 90_000);
    await pause('conflict', 150_000);
    expect(h.pending.rateLimitUntil!(scope)).toBe(120_000);
    expect(await h.queue.rateLimitUntil(scope)).toBe(120_000);
    for (const other of [
      { ...scope, accountId: hex(2) },
      { ...scope, environment: 'https://b.test' },
    ]) {
      expect(h.pending.rateLimitUntil!(other)).toBe(0);
      expect(await h.queue.rateLimitUntil(other)).toBe(0);
      expect(await h.pending.retryAt!(other, uuidOf(999))).toBe(0);
    }
    await h.queue.discard(h.record);
    expect(await h.pending.retryAt!(scope, uuidOf(999))).toBe(120_000);
  }
);

it('keeps the account deadline after C receipt cleanup', async () => {
  const h = await setup();
  await h.queue.prepare(h.record, payload(h.record.clientRequestId));
  await h.pending.pause!(scope, h.record.clientRequestId, 'busy', 120_000);
  await h.pending.remove(scope, h.record.clientRequestId);
  expect(await h.queue.list(scope)).toEqual([]);
  expect(await h.pending.list(scope)).toEqual([]);
  expect(await h.queue.rateLimitUntil(scope)).toBe(120_000);
});

it.each(['queue', 'pending'] as const)(
  'rolls back the %s row pause and account deadline together on storage failure',
  async (writer) => {
    const h = await setup();
    await h.queue.prepare(h.record, payload(h.record.clientRequestId));
    const broken = failAt(h.db, /UPDATE expense_queue/);
    if (writer === 'queue') {
      const store = await createExpenseQueueStore(broken);
      await expect(store.pause(h.record, 'busy', 120_000)).rejects.toThrow('disk full');
    } else {
      const store = await createPendingExpenseStore(broken);
      await expect(store.pause!(scope, h.record.clientRequestId, 'busy', 120_000)).rejects.toThrow(
        'disk full'
      );
    }
    const observer = await createPendingExpenseStore(broken);
    expect(observer.rateLimitUntil!(scope)).toBe(0);
    expect(await h.queue.rateLimitUntil(scope)).toBe(0);
    expect(await h.queue.list(scope)).toMatchObject([{ nextAt: 0, rateLimitUntil: 0 }]);
  }
);

it('migrates schema 5 deadlines by account and environment and rolls back a failed migration', async () => {
  const h = await setup();
  const other = { ...draft(2), tripId: hex(200) };
  await h.pending.drafts.start(other);
  await h.queue.enqueue(other, options, uuidOf(101));
  const records = await h.queue.list(scope);
  await h.queue.pause(records[0], 'busy', 120_000);
  await h.queue.pause(records[1], 'busy', 90_000);
  await h.db.execAsync('DROP TABLE expense_rate_limit; PRAGMA user_version = 5');
  const broken: SqlDatabase = {
    ...h.db,
    execAsync: async (sql) => {
      await h.db.execAsync(sql);
      if (sql.includes('INSERT INTO expense_rate_limit')) throw new Error('disk full');
    },
  };
  await expect(createExpenseQueueStore(broken)).rejects.toThrow('disk full');
  expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 5 });
  expect(
    await h.db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'expense_rate_limit'")
  ).toBeNull();
  const upgraded = await createExpenseQueueStore(h.db);
  expect(await upgraded.rateLimitUntil(scope)).toBe(120_000);
  expect(await upgraded.rateLimitUntil({ ...scope, accountId: hex(2) })).toBe(0);
  expect(await upgraded.rateLimitUntil({ ...scope, environment: 'https://b.test' })).toBe(0);
  for (const r of records) await upgraded.discard(r);
  expect(await h.pending.retryAt!(scope, uuidOf(999))).toBe(120_000);
});
