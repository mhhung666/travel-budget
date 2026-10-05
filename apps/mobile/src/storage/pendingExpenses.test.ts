import { afterEach, describe, expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import {
  createPendingExpenseStore,
  type PendingExpense,
  type PendingExpenseStore,
  type PendingScope,
} from './pendingExpenses';

const hex = (n: number) => n.toString(16).padStart(24, '0');
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ENV = 'http://127.0.0.1:3000/api/v1';
const scope = (accountId = hex(1), environment = ENV): PendingScope => ({ environment, accountId });

function record(n: number, patch: Partial<PendingExpense> = {}): PendingExpense {
  const clientRequestId = patch.clientRequestId ?? uuid(n);
  return {
    ...scope(),
    tripId: hex(100),
    clientRequestId,
    payload: {
      client_request_id: clientRequestId,
      payer_id: hex(1),
      original_amount: 100,
      currency: 'TWD',
      exchange_rate: 1,
      description: `Dinner ${n}`,
      category: 'food',
      date: '2026-10-04',
      splits: [
        { user_id: hex(1), share_amount: 50 },
        { user_id: hex(2), share_amount: 50 },
      ],
    },
    status: 'sending',
    createdAt: 1_000 + n,
    updatedAt: 1_000 + n,
    ...patch,
  };
}

const opened: { close(): void }[] = [];
function open() {
  const db = memoryDatabase();
  opened.push(db);
  return db;
}
afterEach(() => opened.splice(0).forEach((db) => db.close()));

describe('pending expense store', () => {
  it('saves a request and reads it back exactly', async () => {
    const store = await createPendingExpenseStore(open());
    const saved = record(1);
    await store.insert(saved);
    expect(await store.get(scope(), uuid(1))).toEqual(saved);
    expect(await store.list(scope())).toEqual([saved]);
  });

  it('keeps hostile text as data', async () => {
    const store = await createPendingExpenseStore(open());
    const saved = record(1);
    saved.payload.description = `x'); DROP TABLE pending_expense; --`;
    await store.insert(saved);
    expect((await store.get(scope(), uuid(1)))?.payload.description).toBe(
      saved.payload.description
    );
    await store.insert(record(2, { environment: `http://x/'; DELETE FROM pending_expense; --` }));
    expect(await store.list(scope())).toHaveLength(1);
  });

  it('creates its schema once and keeps data when opened again', async () => {
    const db = open();
    const first = await createPendingExpenseStore(db);
    await first.insert(record(1));
    const second = await createPendingExpenseStore(db);
    expect(await second.list(scope())).toHaveLength(1);
    expect(
      (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version
    ).toBe(2);
  });

  it('refuses, and leaves untouched, a database written by a newer app', async () => {
    const db = open();
    await createPendingExpenseStore(db);
    await db.execAsync('PRAGMA user_version = 3');
    await expect(createPendingExpenseStore(db)).rejects.toThrow('PENDING_STORE_NEWER');
    expect(
      (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version
    ).toBe(3);
  });

  describe('isolation', () => {
    let store: PendingExpenseStore;
    const accountA = scope(hex(1));
    const accountB = scope(hex(2));
    const otherEnvironment = scope(hex(1), 'https://api.example.test/api/v1');
    const setup = async () => {
      store = await createPendingExpenseStore(open());
      await store.insert(record(1, { ...accountA }));
      await store.insert(record(2, { ...accountB }));
      await store.insert(record(3, { ...otherEnvironment }));
    };

    it('never shows a record to another account or environment', async () => {
      await setup();
      expect((await store.list(accountA)).map((r) => r.clientRequestId)).toEqual([uuid(1)]);
      expect((await store.list(accountB)).map((r) => r.clientRequestId)).toEqual([uuid(2)]);
      expect((await store.list(otherEnvironment)).map((r) => r.clientRequestId)).toEqual([uuid(3)]);
      expect(await store.get(accountB, uuid(1))).toBeNull();
      expect(await store.get(otherEnvironment, uuid(1))).toBeNull();
    });

    it('never changes or removes another account’s record', async () => {
      await setup();
      await store.remove(accountB, uuid(1));
      await store.remove(otherEnvironment, uuid(1));
      await store.setStatus(accountB, uuid(1), 'unconfirmed');
      expect(await store.get(accountA, uuid(1))).toEqual(record(1, { ...accountA }));
    });

    it('allows the same request id for different accounts without mixing them', async () => {
      await setup();
      await store.insert(
        record(1, { ...accountB, payload: { ...record(1).payload, description: 'B copy' } })
      );
      expect((await store.get(accountA, uuid(1)))?.payload.description).toBe('Dinner 1');
      expect((await store.get(accountB, uuid(1)))?.payload.description).toBe('B copy');
    });
  });

  it('filters by trip and lists oldest first', async () => {
    const store = await createPendingExpenseStore(open());
    await store.insert(record(3, { tripId: hex(100) }));
    await store.insert(record(1, { tripId: hex(100) }));
    await store.insert(record(2, { tripId: hex(200) }));
    expect((await store.list(scope())).map((r) => r.clientRequestId)).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
    expect((await store.list(scope(), hex(100))).map((r) => r.clientRequestId)).toEqual([
      uuid(1),
      uuid(3),
    ]);
    expect(await store.list(scope(), hex(300))).toEqual([]);
  });

  it('updates the status only, leaving the frozen body alone', async () => {
    const store = await createPendingExpenseStore(open());
    await store.insert(record(1));
    await store.setStatus(scope(), uuid(1), 'unconfirmed');
    const stored = await store.get(scope(), uuid(1));
    expect(stored?.status).toBe('unconfirmed');
    expect(stored?.payload).toEqual(record(1).payload);
    expect(stored?.createdAt).toBe(record(1).createdAt);
    expect(stored?.updatedAt).toBeGreaterThanOrEqual(record(1).updatedAt);
  });

  it('removes one request and is quiet about a missing one', async () => {
    const store = await createPendingExpenseStore(open());
    await store.insert(record(1));
    await store.insert(record(2));
    await store.remove(scope(), uuid(1));
    await store.remove(scope(), uuid(1));
    expect((await store.list(scope())).map((r) => r.clientRequestId)).toEqual([uuid(2)]);
  });

  it('refuses a second record with the same environment, account and request id', async () => {
    const store = await createPendingExpenseStore(open());
    await store.insert(record(1));
    await expect(store.insert(record(1))).rejects.toThrow();
    expect(await store.list(scope())).toHaveLength(1);
  });

  it('only accepts the two known statuses', async () => {
    const db = open();
    await createPendingExpenseStore(db);
    await expect(
      db.runAsync(
        `INSERT INTO pending_expense VALUES (?, ?, ?, ?, ?, 'done', 1, 1)`,
        ENV,
        hex(1),
        uuid(1),
        hex(100),
        '{}'
      )
    ).rejects.toThrow();
  });

  it('skips rows that are no longer valid requests without deleting them', async () => {
    const db = open();
    const store = await createPendingExpenseStore(db);
    await store.insert(record(1));
    const insert = (id: string, payload: string) =>
      db.runAsync(
        `INSERT INTO pending_expense VALUES (?, ?, ?, ?, ?, 'unconfirmed', 1, 1)`,
        ENV,
        hex(1),
        id,
        hex(100),
        payload
      );
    await insert(uuid(2), 'not json');
    await insert(uuid(3), JSON.stringify({ ...record(3).payload, original_amount: -1 }));
    await insert(uuid(4), JSON.stringify(record(5).payload)); // body belongs to another request id
    expect((await store.list(scope())).map((r) => r.clientRequestId)).toEqual([uuid(1)]);
    expect(await store.get(scope(), uuid(2))).toBeNull();
    const rows = await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pending_expense');
    expect(rows[0].n).toBe(4);
  });
});
