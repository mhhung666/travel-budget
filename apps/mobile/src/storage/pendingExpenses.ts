import { expenseCreateInput, type ExpenseCreateInput } from '@/api/contracts';

export type SqlValue = string | number | null;
/** The part of expo-sqlite's `SQLiteDatabase` this store uses, so tests can run it on node:sqlite. */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
}

/** Every record belongs to one API environment and one account; nothing reads across them. */
export interface PendingScope {
  environment: string;
  accountId: string;
}
/** `sending`: an attempt started (or was in flight when the app died); `unconfirmed`: it ended without an answer. */
export type PendingStatus = 'sending' | 'unconfirmed';
export interface PendingExpense extends PendingScope {
  tripId: string;
  clientRequestId: string;
  /** The frozen request body, including `client_request_id`. Never edited after it is saved. */
  payload: ExpenseCreateInput;
  status: PendingStatus;
  createdAt: number;
  updatedAt: number;
}
export interface PendingExpenseStore {
  insert(record: PendingExpense): Promise<void>;
  get(scope: PendingScope, clientRequestId: string): Promise<PendingExpense | null>;
  list(scope: PendingScope, tripId?: string): Promise<PendingExpense[]>;
  setStatus(scope: PendingScope, clientRequestId: string, status: PendingStatus): Promise<void>;
  remove(scope: PendingScope, clientRequestId: string): Promise<void>;
}

const SCHEMA_VERSION = 1;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS pending_expense (
  environment TEXT NOT NULL,
  account_id TEXT NOT NULL,
  client_request_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'unconfirmed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (environment, account_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS pending_expense_by_trip
  ON pending_expense (environment, account_id, trip_id, created_at);
PRAGMA user_version = ${SCHEMA_VERSION};
`;

interface Row {
  environment: string;
  account_id: string;
  client_request_id: string;
  trip_id: string;
  payload: string;
  status: PendingStatus;
  created_at: number;
  updated_at: number;
}
const COLUMNS =
  'environment, account_id, client_request_id, trip_id, payload, status, created_at, updated_at';

/** A row whose body is no longer a valid request cannot be sent, so it is left out, never rewritten. */
function toRecord(row: Row): PendingExpense | null {
  try {
    const payload = expenseCreateInput.parse(JSON.parse(row.payload));
    if (payload.client_request_id !== row.client_request_id) return null;
    return {
      environment: row.environment,
      accountId: row.account_id,
      tripId: row.trip_id,
      clientRequestId: row.client_request_id,
      payload,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

/** Creates the table on first use. A database from a newer app version is refused, not modified. */
export async function createPendingExpenseStore(db: SqlDatabase): Promise<PendingExpenseStore> {
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))
    ?.user_version;
  if ((version ?? 0) > SCHEMA_VERSION) throw new Error('PENDING_STORE_NEWER');
  if ((version ?? 0) < SCHEMA_VERSION) await db.execAsync(SCHEMA);
  return {
    async insert(record) {
      await db.runAsync(
        `INSERT INTO pending_expense (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        record.environment,
        record.accountId,
        record.clientRequestId,
        record.tripId,
        JSON.stringify(record.payload),
        record.status,
        record.createdAt,
        record.updatedAt
      );
    },
    async get(scope, clientRequestId) {
      const row = await db.getFirstAsync<Row>(
        `SELECT ${COLUMNS} FROM pending_expense
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
        scope.environment,
        scope.accountId,
        clientRequestId
      );
      return row ? toRecord(row) : null;
    },
    async list(scope, tripId) {
      const rows = await db.getAllAsync<Row>(
        `SELECT ${COLUMNS} FROM pending_expense
          WHERE environment = ? AND account_id = ?${tripId === undefined ? '' : ' AND trip_id = ?'}
          ORDER BY created_at, client_request_id`,
        scope.environment,
        scope.accountId,
        ...(tripId === undefined ? [] : [tripId])
      );
      return rows.flatMap((row) => toRecord(row) ?? []);
    },
    async setStatus(scope, clientRequestId, status) {
      await db.runAsync(
        `UPDATE pending_expense SET status = ?, updated_at = ?
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
        status,
        Date.now(),
        scope.environment,
        scope.accountId,
        clientRequestId
      );
    },
    async remove(scope, clientRequestId) {
      await db.runAsync(
        `DELETE FROM pending_expense
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
        scope.environment,
        scope.accountId,
        clientRequestId
      );
    },
  };
}
