import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { createLastExpenseTripStore } from './lastExpenseTrip';
import { databaseTask } from './expenseDatabase';

it('persists only the selected ID across restart, isolating accounts and environments', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-last-trip-'));
  const path = join(dir, 'preferences.db');
  let db = memoryDatabase(path);
  try {
    const store = await createLastExpenseTripStore(db);
    const a = { environment: 'https://a.test', accountId: 'a'.repeat(24) };
    const b = { ...a, accountId: 'b'.repeat(24) };
    const env = { ...a, environment: 'https://b.test' };
    await store.write(a, '1'.repeat(24), () => true);
    await store.write(b, '2'.repeat(24), () => true);
    await store.write(env, '3'.repeat(24), () => true);
    db.close();
    db = memoryDatabase(path);
    const restarted = await createLastExpenseTripStore(db);
    expect(await restarted.read(a)).toBe('1'.repeat(24));
    expect(await restarted.read(b)).toBe('2'.repeat(24));
    expect(await restarted.read(env)).toBe('3'.repeat(24));
    expect(await restarted.read({ ...a, accountId: 'c'.repeat(24) })).toBeNull();
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(last_expense_trip)');
    expect(columns.map((c) => c.name)).toEqual(['environment', 'account_id', 'trip_id']);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('rechecks login after serialization waits and leaves the previous ID on failure', async () => {
  const db = memoryDatabase();
  try {
    const store = await createLastExpenseTripStore(db);
    const scope = { environment: 'env', accountId: 'a' };
    await store.write(scope, 'original', () => true);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const block = databaseTask(db, () => wait);
    let current = true;
    const late = store.write(scope, 'late-A', () => current);
    current = false;
    release();
    await block;
    await late;
    expect(await store.read(scope)).toBe('original');
    await db.execAsync(`CREATE TRIGGER reject_preference BEFORE UPDATE ON last_expense_trip
      BEGIN SELECT RAISE(ABORT, 'disk full'); END;`);
    await expect(store.write(scope, 'failed', () => true)).rejects.toThrow();
    expect(await store.read(scope)).toBe('original');
  } finally {
    db.close();
  }
});
