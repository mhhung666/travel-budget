import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { hex, uuidOf } from '@/test/expenseServer';
import { newDraft } from '@/features/expenses/draft';
import { createDraftTripStore } from './draftTrips';
import { createPendingExpenseStore } from './pendingExpenses';

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const options = { members: [{ id: hex(1), displayName: 'Ann' }], categories: ['food' as const] };
const opened: { close(): void }[] = [];
const directories: string[] = [];
const open = (path?: string) => {
  const db = memoryDatabase(path);
  opened.push(db);
  return db;
};
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
it('restores only minimal form snapshots and incomplete input after a file restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-d2-'));
  directories.push(dir);
  const path = join(dir, 'draft.db');
  const db = open(path);
  const catalog = await createDraftTripStore(db);
  const store = await createPendingExpenseStore(db);
  await catalog.rememberName(scope, tripId, 'Private trip', 100);
  await catalog.rememberOptions(scope, tripId, options, 200);
  const raw = {
    ...scope,
    tripId,
    draftId: uuidOf(1),
    revision: 1,
    updatedAt: 201,
    input: { ...newDraft(options, scope.accountId, '2026-10-05'), amountText: '12.' },
  };
  await store.drafts.start(raw);
  opened.pop()!.close();
  const restarted = open(path);
  const restored = await createDraftTripStore(restarted);
  expect(await restored.list(scope)).toEqual([
    { ...scope, tripId, name: 'Private trip', options, archived: null, updatedAt: 200 },
  ]);
  expect(await (await createPendingExpenseStore(restarted)).drafts.load(scope, tripId)).toEqual(
    raw
  );
  expect(Object.keys((await restored.get(scope, tripId))!)).toEqual([
    'environment',
    'accountId',
    'tripId',
    'name',
    'options',
    'archived',
    'updatedAt',
  ]);
});
it('isolates snapshots by environment, account and trip, including A→B→A', async () => {
  const store = await createDraftTripStore(open());
  await store.rememberName(scope, tripId, 'A only', 1);
  await store.rememberOptions(scope, tripId, options, 2);
  const other = { ...scope, accountId: hex(2) };
  const elsewhere = { ...scope, environment: 'https://b.test' };
  expect(await store.list(other)).toEqual([]);
  expect(await store.get(elsewhere, tripId)).toBeNull();
  expect(await store.get(scope, hex(200))).toBeNull();
  await store.rememberName(other, tripId, 'B only', 3);
  expect((await store.get(scope, tripId))?.name).toBe('A only');
  expect((await store.get(other, tripId))?.options).toBeNull();
});
it('keeps a denial across reopening and name refreshes; only fresh options restore access', async () => {
  const db = open();
  const store = await createDraftTripStore(db);
  await store.rememberName(scope, tripId, 'Secret', 1);
  await store.rememberOptions(scope, tripId, options, 2);
  await store.deny(scope, tripId);
  const reopened = await createDraftTripStore(db);
  await reopened.rememberName(scope, tripId, 'Stale list name', 3);
  expect(await reopened.get(scope, tripId)).toBeNull();
  expect(await reopened.list(scope)).toEqual([]);
  const row = await db.getFirstAsync<{ name: string | null; options: string | null }>(
    'SELECT * FROM draft_trip'
  );
  expect(row?.name).toBeNull();
  expect(row?.options).toBeNull();
  await reopened.rememberOptions(scope, tripId, options, 4);
  expect(await reopened.get(scope, tripId)).toMatchObject({ options, name: null, updatedAt: 4 });
});
it('records denial even before an entry exists', async () => {
  const store = await createDraftTripStore(open());
  await store.deny(scope, tripId);
  await store.rememberName(scope, tripId, 'Late trip', 1);
  expect(await store.get(scope, tripId)).toBeNull();
});
it('upgrades a D1 database without replacing its draft or pending tables', async () => {
  const db = open();
  const pending = await createPendingExpenseStore(db);
  const raw = {
    ...scope,
    tripId,
    draftId: uuidOf(1),
    revision: 1,
    updatedAt: 1,
    input: newDraft(options, scope.accountId, '2026-10-05'),
  };
  await pending.drafts.start(raw);
  await db.execAsync(
    'DROP TABLE draft_trip; DROP TABLE expense_queue; DROP TABLE expense_rate_limit; DROP TABLE pending_mutation; ALTER TABLE pending_expense DROP COLUMN api_version; ALTER TABLE pending_expense DROP COLUMN base_currency; ALTER TABLE pending_expense DROP COLUMN money_scale; PRAGMA user_version = 2'
  );
  const store = await createDraftTripStore(db);
  expect(await store.list(scope)).toEqual([]);
  expect(await (await createPendingExpenseStore(db)).drafts.load(scope, tripId)).toEqual(raw);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 11 });
});
it('fails closed on malformed persisted options and exposes storage failures', async () => {
  const db = open();
  const store = await createDraftTripStore(db);
  await store.rememberOptions(scope, tripId, options, 1);
  await db.runAsync('UPDATE draft_trip SET options = ?', '{bad json');
  await expect(store.list(scope)).rejects.toThrow();
  await db.execAsync('DROP TABLE draft_trip');
  await expect(store.rememberOptions(scope, tripId, options, 2)).rejects.toThrow();
});
it('uses SQL parameters for names and rejects invalid remote options before writing', async () => {
  const store = await createDraftTripStore(open());
  const name = "x'); DROP TABLE draft_trip; DROP TABLE expense_queue; --";
  await store.rememberName(scope, tripId, name, 1);
  expect((await store.get(scope, tripId))?.name).toBe(name);
  await expect(
    store.rememberOptions(
      scope,
      tripId,
      { members: [{ id: 'invalid', displayName: 'Bad' }], categories: [] },
      2
    )
  ).rejects.toThrow();
  expect((await store.get(scope, tripId))?.options).toBeNull();
});
it('migrates schema 10 atomically, preserves original UUID/input/denials and restores archive state after file restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-t3a-'));
  directories.push(dir);
  const path = join(dir, 'draft.db');
  const db = open(path);
  const store = await createDraftTripStore(db);
  const pending = await createPendingExpenseStore(db);
  await store.rememberName(scope, tripId, 'Legacy trip', 1);
  await store.rememberOptions(scope, tripId, options, 2);
  await store.deny(scope, hex(200));
  const raw = {
    ...scope,
    tripId,
    draftId: uuidOf(1),
    revision: 1,
    updatedAt: 3,
    input: {
      ...newDraft(options, scope.accountId, '2026-10-12'),
      description: 'Unsaved original input',
    },
  };
  await pending.drafts.start(raw);
  await db.execAsync('ALTER TABLE draft_trip DROP COLUMN archived; PRAGMA user_version = 10');
  const before = await db.getFirstAsync('SELECT * FROM expense_draft');
  const broken = {
    ...db,
    execAsync: async (sql: string) => {
      if (sql.includes('PRAGMA user_version = 11')) throw new Error('disk full');
      await db.execAsync(sql);
    },
  };
  await expect(createDraftTripStore(broken)).rejects.toThrow('disk full');
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 10 });
  expect(
    await db.getAllAsync<{ name: string }>('PRAGMA table_info(draft_trip)')
  ).not.toContainEqual(expect.objectContaining({ name: 'archived' }));
  const upgraded = await createDraftTripStore(db);
  expect((await upgraded.get(scope, tripId))?.archived).toBeNull();
  expect(await upgraded.get(scope, hex(200))).toBeNull();
  expect(await db.getFirstAsync('SELECT * FROM expense_draft')).toEqual(before);
  await upgraded.rememberArchived(scope, tripId, true, 4);
  await upgraded.rememberArchived({ ...scope, accountId: hex(2) }, tripId, false, 5);
  await upgraded.rememberArchived({ ...scope, environment: 'other' }, tripId, false, 6);
  opened.pop()!.close();
  const reopened = open(path);
  const restored = await createDraftTripStore(reopened);
  expect(await restored.get(scope, tripId)).toMatchObject({
    name: 'Legacy trip',
    options,
    archived: true,
  });
  expect(await (await createPendingExpenseStore(reopened)).drafts.load(scope, tripId)).toEqual(raw);
  await restored.rememberArchived(scope, tripId, false, 7);
  expect((await restored.get(scope, tripId))?.archived).toBe(false);
  expect((await restored.get({ ...scope, accountId: hex(2) }, tripId))?.archived).toBe(false);
});
it('archive metadata cannot lift denial or replace form options, including stale reads', async () => {
  const db = open(),
    store = await createDraftTripStore(db);
  await store.rememberOptions(scope, tripId, options, 1);
  await store.rememberArchived(scope, tripId, true, 2);
  expect((await store.get(scope, tripId))?.options).toEqual(options);
  await store.deny(scope, tripId);
  await store.rememberArchived(scope, tripId, false, 3);
  expect(await store.list(scope)).toEqual([]);
  expect(await db.getFirstAsync('SELECT archived, denied FROM draft_trip')).toEqual({
    archived: null,
    denied: 1,
  });
});
it('refuses corrupted persisted archive metadata instead of assuming an unarchived trip', async () => {
  const db = open(),
    store = await createDraftTripStore(db);
  await store.rememberOptions(scope, tripId, options, 1);
  await db.execAsync('PRAGMA ignore_check_constraints = ON; UPDATE draft_trip SET archived = 9');
  await expect(store.get(scope, tripId)).rejects.toThrow('INVALID_TRIP_ARCHIVE');
  await expect(store.list(scope)).rejects.toThrow('INVALID_TRIP_ARCHIVE');
});
