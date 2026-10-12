import type { PendingScope, SqlDatabase } from './pendingExpenses';
import { databaseTask } from './expenseDatabase';

/** Only an ID, never a name, roster, form input or credential. Independent of appearance. */
export async function createLastExpenseTripStore(db: SqlDatabase) {
  await databaseTask(db, () =>
    db.execAsync(`CREATE TABLE IF NOT EXISTS last_expense_trip (
      environment TEXT NOT NULL, account_id TEXT NOT NULL, trip_id TEXT NOT NULL,
      PRIMARY KEY (environment, account_id)
    )`)
  );
  return {
    read: (scope: PendingScope) =>
      databaseTask(
        db,
        async () =>
          (
            await db.getFirstAsync<{ trip_id: string }>(
              'SELECT trip_id FROM last_expense_trip WHERE environment = ? AND account_id = ?',
              scope.environment,
              scope.accountId
            )
          )?.trip_id ?? null
      ),
    write: (scope: PendingScope, tripId: string, current: () => boolean) =>
      databaseTask(db, async () => {
        // Recheck after connection/serialization waits; A→B→A must not save a late preference.
        if (!current()) return;
        await db.runAsync(
          `INSERT INTO last_expense_trip (environment, account_id, trip_id) VALUES (?, ?, ?)
           ON CONFLICT(environment, account_id) DO UPDATE SET trip_id = excluded.trip_id`,
          scope.environment,
          scope.accountId,
          tripId
        );
      }),
  };
}
export type LastExpenseTripStore = Awaited<ReturnType<typeof createLastExpenseTripStore>>;
