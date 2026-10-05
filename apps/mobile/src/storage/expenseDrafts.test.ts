import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { hex, uuidOf } from '@/test/expenseServer';
import {
  createPendingExpenseStore,
  type PendingExpense,
  type SqlDatabase,
} from './pendingExpenses';
import type { StoredExpenseDraft } from './expenseDrafts';

declare const process: { execPath: string };

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const draft = (patch: Partial<StoredExpenseDraft> = {}): StoredExpenseDraft => ({
  ...scope,
  tripId,
  draftId: uuidOf(10),
  revision: 1,
  updatedAt: 1000,
  input: {
    description: '  unfinished  ',
    amountText: '12.',
    date: '2026-',
    category: 'food',
    payerId: null,
    memberIds: [],
  },
  ...patch,
});
const pending = (): PendingExpense => ({
  ...scope,
  tripId,
  clientRequestId: uuidOf(1),
  status: 'sending',
  createdAt: 1000,
  updatedAt: 1000,
  payload: {
    client_request_id: uuidOf(1),
    payer_id: hex(1),
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    description: 'Dinner',
    category: 'food',
    date: '2026-10-05',
    splits: [{ user_id: hex(1), share_amount: 100 }],
  },
});
const opened: { close(): void }[] = [];
const directories: string[] = [];
const open = (path?: string) => {
  const db = memoryDatabase(path);
  opened.push(db);
  return db;
};
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
});

/** Throws at one real SQL statement. Everything before/after it uses the actual SQLite engine. */
function failAt(db: SqlDatabase, pattern: RegExp, api: 'run' | 'exec' = 'run'): SqlDatabase {
  let failed = false;
  const fail = (source: string) => {
    if (!failed && pattern.test(source)) {
      failed = true;
      throw new Error('disk full');
    }
  };
  return {
    ...db,
    runAsync: async (source, ...params) => {
      if (api === 'run') fail(source);
      return db.runAsync(source, ...params);
    },
    execAsync: async (source) => {
      if (api === 'exec') fail(source);
      return db.execAsync(source);
    },
  };
}

describe('durable raw drafts', () => {
  it('survives closing and reopening the actual SQLite file, preserving incomplete inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tb-draft-'));
    directories.push(dir);
    const path = join(dir, 'expense.db');
    const db = open(path);
    const first = await createPendingExpenseStore(db);
    await first.drafts.start(draft());
    db.close();
    opened.splice(opened.indexOf(db), 1);
    const second = await createPendingExpenseStore(open(path));
    expect(await second.drafts.load(scope, tripId)).toEqual(draft());
    expect(await second.list(scope)).toEqual([]);
  });
  it('isolates every read, write and discard by environment, account and trip', async () => {
    const store = await createPendingExpenseStore(open());
    const records = [
      draft(),
      draft({ environment: 'https://b.test' }),
      draft({ accountId: hex(2) }),
      draft({ tripId: hex(200) }),
    ];
    for (const record of records) await store.drafts.start(record);
    for (const record of records)
      expect(await store.drafts.load(record, record.tripId)).toEqual(record);
    expect(await store.drafts.save(draft({ accountId: hex(3), revision: 2 }))).toBe(false);
    await store.drafts.discard({ ...scope, accountId: hex(3) }, tripId, draft().draftId);
    expect(await store.drafts.load(scope, tripId)).toEqual(draft());
    await store.drafts.discard(scope, tripId, draft().draftId);
    expect(await store.drafts.load(scope, tripId)).toBeNull();
    for (const record of records.slice(1))
      expect(await store.drafts.load(record, record.tripId)).toEqual(record);
  });
  it('cannot overwrite newer input with an older or colliding revision', async () => {
    const store = await createPendingExpenseStore(open());
    await store.drafts.start(draft());
    const newest = draft({ revision: 3, input: { ...draft().input, amountText: 'newest' } });
    const results = await Promise.all([
      store.drafts.save(newest),
      store.drafts.save(draft({ revision: 2 })),
      store.drafts.save(draft({ revision: 3 })),
    ]);
    expect(results).toEqual([true, false, false]);
    expect(await store.drafts.load(scope, tripId)).toEqual(newest);
  });
  it('discard leaves a tombstone: old saves and starts cannot revive it or overwrite a new draft', async () => {
    const store = await createPendingExpenseStore(open());
    await store.drafts.start(draft());
    await store.drafts.discard(scope, tripId, draft().draftId);
    expect(await store.drafts.save(draft({ revision: 99 }))).toBe(false);
    await expect(store.drafts.start(draft())).rejects.toThrow();
    const next = draft({ draftId: uuidOf(20) });
    await store.drafts.start(next);
    expect(await store.drafts.save(draft({ revision: 100 }))).toBe(false);
    expect(await store.drafts.load(scope, tripId)).toEqual(next);
  });
  it('can discard an unsaved generation without allowing a delayed start to revive it', async () => {
    const store = await createPendingExpenseStore(open());
    await store.drafts.discard(scope, tripId, draft().draftId);
    await expect(store.drafts.start(draft())).rejects.toThrow();
    expect(await store.drafts.load(scope, tripId)).toBeNull();
    await store.drafts.start(draft({ draftId: uuidOf(20) }));
    expect((await store.drafts.load(scope, tripId))?.draftId).toBe(uuidOf(20));
  });
  it('keeps the last saved input when a write fails', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    const broken = await createPendingExpenseStore(failAt(db, /UPDATE expense_draft SET revision/));
    await expect(broken.drafts.save(draft({ revision: 2 }))).rejects.toThrow('disk full');
    expect(await store.drafts.load(scope, tripId)).toEqual(draft());
  });
  it('rejects preview/splits/token fields instead of persisting them', async () => {
    const store = await createPendingExpenseStore(open());
    await expect(
      store.drafts.start(
        draft({ input: { ...draft().input, token: 'secret' } as StoredExpenseDraft['input'] })
      )
    ).rejects.toThrow();
    expect(await store.drafts.load(scope, tripId)).toBeNull();
  });
  it('retains damaged raw data and refuses to silently replace it', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    await db.runAsync("UPDATE expense_draft SET input = 'not json'");
    await expect(store.drafts.load(scope, tripId)).rejects.toThrow();
    await expect(store.drafts.start(draft({ draftId: uuidOf(20) }))).rejects.toThrow(
      'DRAFT_BLOCKED'
    );
  });
});

describe('migration and atomic handoff', () => {
  it('upgrades C schema without changing any existing pending record', async () => {
    const db = open();
    const old = await createPendingExpenseStore(db);
    await old.insert(pending());
    await db.execAsync('DROP TABLE expense_draft; PRAGMA user_version = 1;');
    const upgraded = await createPendingExpenseStore(db);
    expect(await upgraded.list(scope)).toEqual([pending()]);
    await upgraded.drafts.start(draft({ tripId: hex(200) }));
    expect(await upgraded.drafts.load(scope, hex(200))).toEqual(draft({ tripId: hex(200) }));
  });
  it('rolls back a failed migration and can safely retry', async () => {
    const db = open();
    await expect(
      createPendingExpenseStore(failAt(db, /CREATE TABLE expense_draft/, 'exec'))
    ).rejects.toThrow();
    expect(
      (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version
    ).toBe(0);
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    expect(await store.drafts.load(scope, tripId)).toEqual(draft());
  });
  it.each([
    ['before pending insert', /INSERT INTO pending_expense/, 'run'],
    ['between insert and handoff', /SET status = 'handed-off'/, 'run'],
    ['before commit', /^COMMIT$/, 'exec'],
  ] as const)(
    'rolls back %s so restart finds only the editable draft',
    async (_label, pattern, api) => {
      const db = open();
      const store = await createPendingExpenseStore(db);
      await store.drafts.start(draft());
      const broken = await createPendingExpenseStore(failAt(db, pattern, api));
      await expect(broken.insert(pending(), draft())).rejects.toThrow('disk full');
      const restarted = await createPendingExpenseStore(db);
      expect(await restarted.list(scope)).toEqual([]);
      expect(await restarted.drafts.load(scope, tripId)).toEqual(draft());
    }
  );
  it('after handoff commit, restart has one frozen request and cannot resume or discard its source draft', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    await store.insert(pending(), draft());
    const restarted = await createPendingExpenseStore(db);
    expect(await restarted.list(scope)).toEqual([pending()]);
    await expect(restarted.drafts.load(scope, tripId)).rejects.toThrow('DRAFT_HANDED_OFF');
    await expect(restarted.drafts.discard(scope, tripId, draft().draftId)).rejects.toThrow();
    expect(await restarted.drafts.save(draft({ revision: 2 }))).toBe(false);
    await expect(
      restarted.insert({ ...pending(), clientRequestId: uuidOf(2) }, draft())
    ).rejects.toThrow();
  });
  it.each(['inserted', 'handed-off', 'committed'])(
    'process death at %s leaves either the draft or its frozen pending request',
    async (stage) => {
      const dir = mkdtempSync(join(tmpdir(), 'tb-handoff-crash-'));
      directories.push(dir);
      const path = join(dir, 'expense.db');
      const db = open(path);
      const store = await createPendingExpenseStore(db);
      await store.drafts.start(draft());
      db.close();
      opened.splice(opened.indexOf(db), 1);
      const child = spawnSync(process.execPath, [
        '-e',
        `
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(process.argv[1]);
      const record = JSON.parse(process.argv[3]);
      db.exec('BEGIN IMMEDIATE');
      db.prepare("INSERT INTO pending_expense VALUES (?, ?, ?, ?, ?, 'sending', 1000, 1000)").run(
        record.environment, record.accountId, record.clientRequestId, record.tripId, JSON.stringify(record.payload));
      if (process.argv[2] !== 'inserted') db.prepare("UPDATE expense_draft SET status = 'handed-off', client_request_id = ?").run(record.clientRequestId);
      if (process.argv[2] === 'committed') db.exec('COMMIT');
      // Immediate process death: no SQLite close and no application cleanup.
      process.exit(0);
    `,
        path,
        stage,
        JSON.stringify(pending()),
      ]);
      expect(child.status, child.stderr.toString()).toBe(0);
      const restarted = await createPendingExpenseStore(open(path));
      if (stage === 'committed') {
        expect(await restarted.list(scope)).toEqual([pending()]);
        await expect(restarted.drafts.load(scope, tripId)).rejects.toThrow('DRAFT_HANDED_OFF');
      } else {
        expect(await restarted.list(scope)).toEqual([]);
        expect(await restarted.drafts.load(scope, tripId)).toEqual(draft());
      }
    }
  );
  it('requires the exact saved generation and revision before handing off', async () => {
    const store = await createPendingExpenseStore(open());
    await store.drafts.start(draft());
    await store.drafts.save(draft({ revision: 2 }));
    await expect(store.insert(pending(), draft())).rejects.toThrow('DRAFT_CHANGED');
    await expect(
      store.insert(pending(), { ...draft(), draftId: uuidOf(20), revision: 2 })
    ).rejects.toThrow('DRAFT_CHANGED');
    expect(await store.list(scope)).toEqual([]);
  });
  it('known rejection atomically restores raw input; successful cleanup prevents revival', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    await store.insert(pending(), draft());
    await store.remove(scope, uuidOf(1), 'rejected');
    const restored = await store.drafts.load(scope, tripId);
    expect(restored).toEqual(draft({ revision: 2 }));
    expect(await store.list(scope)).toEqual([]);
    await store.insert(pending(), restored!);
    await store.remove(scope, uuidOf(1));
    expect(await store.drafts.load(scope, tripId)).toBeNull();
    expect(await store.drafts.save(draft({ revision: 100 }))).toBe(false);
    const restarted = await createPendingExpenseStore(db);
    expect(await restarted.drafts.load(scope, tripId)).toBeNull();
  });
  it('cleanup failure never leaves a resumable draft beside a pending request', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.drafts.start(draft());
    await store.insert(pending(), draft());
    const broken = await createPendingExpenseStore(failAt(db, /DELETE FROM pending_expense/));
    await expect(broken.remove(scope, uuidOf(1), 'rejected')).rejects.toThrow();
    expect(await store.list(scope)).toHaveLength(1);
    await expect(store.drafts.load(scope, tripId)).rejects.toThrow('DRAFT_HANDED_OFF');
  });
});
