import {
  currentExpenseRateLimit,
  extendExpenseRateLimit,
  readExpenseRateLimit,
  rememberExpenseRateLimit,
} from './expenseRateLimit';
import { expenseCreateInput, type ExpenseCreateInput } from '@/api/contracts';
import { databaseTask, migrateExpenseDatabase, transaction } from './expenseDatabase';
import { expenseDraftSchema, type DraftRef, type ExpenseDraftStore } from './expenseDrafts';

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
  insert(record: PendingExpense, draft?: DraftRef): Promise<void>;
  drafts: ExpenseDraftStore;
  get(scope: PendingScope, clientRequestId: string): Promise<PendingExpense | null>;
  list(scope: PendingScope, tripId?: string): Promise<PendingExpense[]>;
  /** Maximum of the request cooldown and the durable account/environment rate limit. */
  retryAt?(scope: PendingScope, clientRequestId: string): Promise<number>;
  /** Synchronous account deadline, hydrated by retryAt and updated after committed pauses. */
  rateLimitUntil?(scope: PendingScope): number;
  /** Persist account rate limits and queue cooldown / conflict at the HTTP boundary. */
  pause?(
    scope: PendingScope,
    clientRequestId: string,
    reason: string,
    nextAt: number
  ): Promise<void>;
  setStatus(scope: PendingScope, clientRequestId: string, status: PendingStatus): Promise<void>;
  remove(
    scope: PendingScope,
    clientRequestId: string,
    resolution?: 'committed' | 'rejected' | 'conflict'
  ): Promise<void>;
}

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
  await migrateExpenseDatabase(db);
  const serial = <T>(task: () => Promise<T>) => databaseTask(db, task);
  const params = (scope: PendingScope, tripId: string) => [
    scope.environment,
    scope.accountId,
    tripId,
  ];
  const draftRow = (scope: PendingScope, tripId: string) =>
    db.getFirstAsync<{
      draft_id: string;
      revision: number;
      input: string;
      updated_at: number;
      status: string;
    }>(
      'SELECT * FROM expense_draft WHERE environment = ? AND account_id = ? AND trip_id = ?',
      ...params(scope, tripId)
    );
  const drafts: ExpenseDraftStore = {
    load: (scope, tripId) =>
      serial(async () => {
        const row = await draftRow(scope, tripId);
        if (!row || row.status === 'discarded') return null;
        if (row.status === 'handed-off') throw new Error('DRAFT_HANDED_OFF');
        return {
          ...scope,
          tripId,
          draftId: row.draft_id,
          revision: row.revision,
          input: expenseDraftSchema.parse(JSON.parse(row.input)),
          updatedAt: row.updated_at,
        };
      }),
    start: (record) =>
      serial(() =>
        transaction(db, async () => {
          const row = await draftRow(record, record.tripId);
          const pending = await db.getFirstAsync(
            'SELECT 1 FROM pending_expense WHERE environment = ? AND account_id = ? AND trip_id = ?',
            ...params(record, record.tripId)
          );
          if (pending || (row && (row.status !== 'discarded' || row.draft_id === record.draftId)))
            throw new Error('DRAFT_BLOCKED');
          await db.runAsync(
            `INSERT INTO expense_draft
        (environment, account_id, trip_id, draft_id, revision, input, updated_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'editing')
        ON CONFLICT (environment, account_id, trip_id) DO UPDATE SET
          draft_id = excluded.draft_id, revision = excluded.revision, input = excluded.input,
          updated_at = excluded.updated_at, status = 'editing', client_request_id = NULL`,
            ...params(record, record.tripId),
            record.draftId,
            record.revision,
            JSON.stringify(expenseDraftSchema.parse(record.input)),
            record.updatedAt
          );
        })
      ),
    save: (record) =>
      serial(async () => {
        await db.runAsync(
          `UPDATE expense_draft SET revision = ?, input = ?, updated_at = ?
        WHERE environment = ? AND account_id = ? AND trip_id = ? AND draft_id = ?
          AND status = 'editing' AND revision < ?`,
          record.revision,
          JSON.stringify(expenseDraftSchema.parse(record.input)),
          record.updatedAt,
          ...params(record, record.tripId),
          record.draftId,
          record.revision
        );
        const row = await draftRow(record, record.tripId);
        return (
          row?.status === 'editing' &&
          row.draft_id === record.draftId &&
          row.revision === record.revision &&
          row.input === JSON.stringify(expenseDraftSchema.parse(record.input))
        );
      }),
    discard: (scope, tripId, draftId) =>
      serial(() =>
        transaction(db, async () => {
          const row = await draftRow(scope, tripId);
          if (row && (row.draft_id !== draftId || row.status === 'handed-off'))
            throw new Error('DRAFT_CHANGED');
          // Even an initial save that failed can be discarded. The tombstone also fences off any
          // delayed start from that generation, rather than treating a missing row as a fresh draft.
          await db.runAsync(
            `INSERT INTO expense_draft
        (environment, account_id, trip_id, draft_id, revision, input, updated_at, status)
        VALUES (?, ?, ?, ?, 0, '{}', ?, 'discarded')
        ON CONFLICT (environment, account_id, trip_id) DO UPDATE SET status = 'discarded', input = '{}'`,
            ...params(scope, tripId),
            draftId,
            Date.now()
          );
        })
      ),
  };
  return {
    drafts,
    insert: (record, draft) =>
      serial(() =>
        transaction(db, async () => {
          if (draft) {
            const row = await draftRow(record, record.tripId);
            const pending = await db.getFirstAsync(
              'SELECT 1 FROM pending_expense WHERE environment = ? AND account_id = ? AND trip_id = ?',
              ...params(record, record.tripId)
            );
            if (
              pending ||
              !row ||
              row.status !== 'editing' ||
              row.draft_id !== draft.draftId ||
              row.revision !== draft.revision
            )
              throw new Error('DRAFT_CHANGED');
          }
          await db.runAsync(
            `INSERT INTO pending_expense (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            record.environment,
            record.accountId,
            record.clientRequestId,
            record.tripId,
            JSON.stringify(expenseCreateInput.parse(record.payload)),
            record.status,
            record.createdAt,
            record.updatedAt
          );
          if (draft)
            await db.runAsync(
              `UPDATE expense_draft SET status = 'handed-off', client_request_id = ?
        WHERE environment = ? AND account_id = ? AND trip_id = ? AND draft_id = ?`,
              record.clientRequestId,
              ...params(record, record.tripId),
              draft.draftId
            );
        })
      ),
    get: (scope, clientRequestId) =>
      serial(async () => {
        const row = await db.getFirstAsync<Row>(
          `SELECT ${COLUMNS} FROM pending_expense
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
          scope.environment,
          scope.accountId,
          clientRequestId
        );
        return row ? toRecord(row) : null;
      }),
    list: (scope, tripId) =>
      serial(async () => {
        const rows = await db.getAllAsync<Row>(
          `SELECT ${COLUMNS} FROM pending_expense
          WHERE environment = ? AND account_id = ?${tripId === undefined ? '' : ' AND trip_id = ?'}
          ORDER BY created_at, client_request_id`,
          scope.environment,
          scope.accountId,
          ...(tripId === undefined ? [] : [tripId])
        );
        return rows.flatMap((row) => toRecord(row) ?? []);
      }),
    rateLimitUntil: (scope) => currentExpenseRateLimit(db, scope),
    retryAt: (scope, clientRequestId) =>
      serial(async () => {
        const row = await db.getFirstAsync<{ next_at: number }>(
          'SELECT next_at FROM expense_queue WHERE environment = ? AND account_id = ? AND client_request_id = ?',
          scope.environment,
          scope.accountId,
          clientRequestId
        );
        return Math.max(row?.next_at ?? 0, await readExpenseRateLimit(db, scope));
      }),
    setStatus: (scope, clientRequestId, status) =>
      serial(async () => {
        await db.runAsync(
          `UPDATE pending_expense SET status = ?, updated_at = ?
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
          status,
          Date.now(),
          scope.environment,
          scope.accountId,
          clientRequestId
        );
      }),
    pause: (scope, clientRequestId, reason, nextAt) =>
      serial(async () => {
        await transaction(db, async () => {
          if (reason === 'busy') await extendExpenseRateLimit(db, scope, nextAt);
          await db.runAsync(
            `UPDATE expense_queue SET reason = CASE WHEN reason = 'conflict' THEN reason ELSE ? END,
          next_at = MAX(next_at, ?), rate_limit_until = MAX(rate_limit_until, ?)
          WHERE environment = ? AND account_id = ? AND client_request_id = ? AND status = 'prepared'`,
            reason,
            nextAt,
            reason === 'busy' ? nextAt : 0,
            scope.environment,
            scope.accountId,
            clientRequestId
          );
        });
        if (reason === 'busy') rememberExpenseRateLimit(db, scope, nextAt);
      }),
    remove: (scope, clientRequestId, resolution = 'committed') =>
      serial(() =>
        transaction(db, async () => {
          // Rejection restores the raw input atomically with removal. Success leaves a tombstone,
          // so queued writes from the old editor cannot bring a submitted draft back.
          await db.runAsync(
            `UPDATE expense_draft SET status = ?, revision = revision + 1,
        input = CASE WHEN ? <> 'rejected' THEN '{}' ELSE input END, client_request_id = NULL
        WHERE environment = ? AND account_id = ? AND client_request_id = ? AND status = 'handed-off'`,
            resolution === 'rejected' ? 'editing' : 'discarded',
            resolution,
            scope.environment,
            scope.accountId,
            clientRequestId
          );
          if (resolution === 'committed')
            await db.runAsync(
              'DELETE FROM expense_queue WHERE environment = ? AND account_id = ? AND client_request_id = ?',
              scope.environment,
              scope.accountId,
              clientRequestId
            );
          else
            await db.runAsync(
              'UPDATE expense_queue SET status = ?, reason = ?, next_at = 0 WHERE environment = ? AND account_id = ? AND client_request_id = ?',
              resolution === 'conflict' ? 'resolved' : 'attention',
              resolution === 'conflict' ? 'conflict' : 'rejected',
              scope.environment,
              scope.accountId,
              clientRequestId
            );
          await db.runAsync(
            `DELETE FROM pending_expense
          WHERE environment = ? AND account_id = ? AND client_request_id = ?`,
            scope.environment,
            scope.accountId,
            clientRequestId
          );
        })
      ),
  };
}
