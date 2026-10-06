import type { SqlDatabase } from './pendingExpenses';

const queues = new WeakMap<SqlDatabase, Promise<unknown>>();
/** All access to the shared connection is serialized, including C reads during a D1 transaction. */
export function databaseTask<T>(db: SqlDatabase, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(db) ?? Promise.resolve()).then(task);
  queues.set(
    db,
    run.catch(() => undefined)
  );
  return run;
}
export async function transaction<T>(db: SqlDatabase, task: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await task();
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

const SCHEMA_VERSION = 8;
/** Central, additive migration: the original C table and every pending request are retained. */
export function migrateExpenseDatabase(db: SqlDatabase): Promise<void> {
  return databaseTask(db, async () => {
    const version =
      (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (version > SCHEMA_VERSION) throw new Error('PENDING_STORE_NEWER');
    if (version === SCHEMA_VERSION) return;
    await transaction(db, async () => {
      if (version < 1)
        await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_expense (
          environment TEXT NOT NULL, account_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
          trip_id TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('sending', 'unconfirmed')),
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          PRIMARY KEY (environment, account_id, client_request_id)
        );
        CREATE INDEX IF NOT EXISTS pending_expense_by_trip
          ON pending_expense (environment, account_id, trip_id, created_at);
      `);
      if (version < 2)
        await db.execAsync(`
        CREATE TABLE expense_draft (
          environment TEXT NOT NULL, account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
          draft_id TEXT NOT NULL, revision INTEGER NOT NULL, input TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('editing', 'discarded', 'handed-off')),
          client_request_id TEXT,
          PRIMARY KEY (environment, account_id, trip_id)
        );
      `);
      if (version < 3)
        await db.execAsync(`
        CREATE TABLE draft_trip (
          environment TEXT NOT NULL, account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
          name TEXT, options TEXT, updated_at INTEGER NOT NULL,
          denied INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (environment, account_id, trip_id)
        );
      `);
      if (version < 4)
        await db.execAsync(`
        CREATE TABLE expense_queue (
          environment TEXT NOT NULL, account_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
          trip_id TEXT NOT NULL, input TEXT NOT NULL, roster TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('queued', 'attention', 'prepared', 'resolved')),
          reason TEXT, next_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          PRIMARY KEY (environment, account_id, client_request_id)
        );
      `);
      if (version < 5)
        await db.execAsync(`
        ALTER TABLE expense_queue ADD COLUMN rate_limit_until INTEGER NOT NULL DEFAULT 0;
        -- Legacy conflict rows may hide a 429; conservatively retain their existing deadline.
        UPDATE expense_queue SET rate_limit_until = next_at WHERE reason IN ('busy', 'conflict');
      `);
      if (version < 6)
        await db.execAsync(`
        CREATE TABLE expense_rate_limit (
          environment TEXT NOT NULL, account_id TEXT NOT NULL,
          rate_limit_until INTEGER NOT NULL,
          PRIMARY KEY (environment, account_id)
        );
        INSERT INTO expense_rate_limit (environment, account_id, rate_limit_until)
          SELECT environment, account_id, MAX(rate_limit_until) FROM expense_queue
          GROUP BY environment, account_id HAVING MAX(rate_limit_until) > 0;
      `);
      if (version < 7)
        await db.execAsync(`
        CREATE TABLE pending_mutation (
          environment TEXT NOT NULL, account_id TEXT NOT NULL, client_request_id TEXT NOT NULL,
          operation TEXT NOT NULL, payload TEXT, result TEXT,
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
          conflict INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          PRIMARY KEY (environment, account_id, client_request_id)
        );
      `);
      if (version < 8)
        await db.execAsync(`
        ALTER TABLE pending_mutation ADD COLUMN trip_id TEXT;
        CREATE INDEX pending_mutation_by_trip ON pending_mutation(environment, account_id, trip_id, status);
      `);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  });
}
