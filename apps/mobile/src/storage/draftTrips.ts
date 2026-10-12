import { expenseOptionsSchema, type ExpenseOptions } from '@/api/contracts';
import { databaseTask, migrateExpenseDatabase } from './expenseDatabase';
import type { PendingScope, SqlDatabase } from './pendingExpenses';

/** Only a name, known personal archive state and form options, never ledger amounts, budgets, tokens or previews. */
export interface DraftTrip extends PendingScope {
  tripId: string;
  name: string | null;
  options: ExpenseOptions | null;
  archived: boolean | null;
  updatedAt: number;
}
export interface DraftTripStore {
  list(scope: PendingScope): Promise<DraftTrip[]>;
  get(scope: PendingScope, tripId: string): Promise<DraftTrip | null>;
  rememberName(scope: PendingScope, tripId: string, name: string, now: number): Promise<void>;
  /** A successful options read is the only event that lifts a durable trip denial. */
  rememberOptions(
    scope: PendingScope,
    tripId: string,
    options: ExpenseOptions,
    now: number
  ): Promise<void>;
  rememberArchived(
    scope: PendingScope,
    tripId: string,
    archived: boolean,
    now: number
  ): Promise<void>;
  deny(scope: PendingScope, tripId: string): Promise<void>;
}
interface Row {
  trip_id: string;
  name: string | null;
  options: string | null;
  archived: number | null;
  updated_at: number;
}
export async function createDraftTripStore(db: SqlDatabase): Promise<DraftTripStore> {
  await migrateExpenseDatabase(db);
  const serial = <T>(run: () => Promise<T>) => databaseTask(db, run);
  const params = (scope: PendingScope, tripId: string) => [
    scope.environment,
    scope.accountId,
    tripId,
  ];
  const decode = (scope: PendingScope, row: Row): DraftTrip => {
    if (row.archived !== null && row.archived !== 0 && row.archived !== 1)
      throw new Error('INVALID_TRIP_ARCHIVE');
    return {
      ...scope,
      tripId: row.trip_id,
      name: row.name,
      options: row.options ? expenseOptionsSchema.parse(JSON.parse(row.options)) : null,
      archived: row.archived === null ? null : row.archived === 1,
      updatedAt: row.updated_at,
    };
  };
  return {
    list: (scope) =>
      serial(async () =>
        (
          await db.getAllAsync<Row>(
            'SELECT * FROM draft_trip WHERE environment = ? AND account_id = ? AND denied = 0 ORDER BY updated_at DESC, trip_id',
            scope.environment,
            scope.accountId
          )
        ).map((row) => decode(scope, row))
      ),
    get: (scope, tripId) =>
      serial(async () => {
        const row = await db.getFirstAsync<Row>(
          'SELECT * FROM draft_trip WHERE environment = ? AND account_id = ? AND trip_id = ? AND denied = 0',
          ...params(scope, tripId)
        );
        return row ? decode(scope, row) : null;
      }),
    rememberName: (scope, tripId, name, now) =>
      serial(async () => {
        // Names from list/landing are not proof that a previously refused form is accessible.
        await db.runAsync(
          `INSERT INTO draft_trip (environment, account_id, trip_id, name, updated_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (environment, account_id, trip_id)
        DO UPDATE SET name = excluded.name WHERE draft_trip.denied = 0`,
          ...params(scope, tripId),
          name,
          now
        );
      }),
    rememberOptions: (scope, tripId, options, now) =>
      serial(async () => {
        const input = expenseOptionsSchema.parse(options);
        await db.runAsync(
          `INSERT INTO draft_trip (environment, account_id, trip_id, options, updated_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (environment, account_id, trip_id)
        DO UPDATE SET options = excluded.options, updated_at = excluded.updated_at, denied = 0`,
          ...params(scope, tripId),
          JSON.stringify(input),
          now
        );
      }),
    rememberArchived: (scope, tripId, archived, now) =>
      serial(async () => {
        await db.runAsync(
          `INSERT INTO draft_trip (environment, account_id, trip_id, archived, updated_at)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (environment, account_id, trip_id)
           DO UPDATE SET archived = excluded.archived WHERE draft_trip.denied = 0`,
          ...params(scope, tripId),
          archived ? 1 : 0,
          now
        );
      }),
    deny: (scope, tripId) =>
      serial(async () => {
        await db.runAsync(
          `INSERT INTO draft_trip (environment, account_id, trip_id, updated_at, denied)
        VALUES (?, ?, ?, 0, 1) ON CONFLICT (environment, account_id, trip_id)
        DO UPDATE SET name = NULL, options = NULL, archived = NULL, denied = 1`,
          ...params(scope, tripId)
        );
      }),
  };
}
