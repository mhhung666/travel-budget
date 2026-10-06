import {
  extendExpenseRateLimit,
  readExpenseRateLimit,
  rememberExpenseRateLimit,
} from './expenseRateLimit';
import { z } from 'zod';
import { expenseCreateInput, expenseOptionsSchema } from '@/api/contracts';
import type { ExpenseOptions, ExpenseCreateInput } from '@/api/contracts';
import { expenseDraftSchema, type StoredExpenseDraft } from './expenseDrafts';
import type { PendingScope, SqlDatabase } from './pendingExpenses';
import { databaseTask, migrateExpenseDatabase, transaction } from './expenseDatabase';

const queueSchema = z.object({
  clientRequestId: z.uuid(),
  tripId: z.string(),
  input: expenseDraftSchema,
  // Order is part of the equal-split rule: it determines who receives the extra cent.
  roster: z.array(z.string()),
  status: z.enum(['queued', 'attention', 'prepared', 'resolved']),
  reason: z.string().nullable(),
  nextAt: z.number(),
  rateLimitUntil: z.number(),
  createdAt: z.number(),
});
export type QueuedExpense = z.infer<typeof queueSchema> & PendingScope;
export interface ExpenseQueueStore {
  rateLimitUntil(scope: PendingScope): Promise<number>;
  list(scope: PendingScope): Promise<QueuedExpense[]>;
  enqueue(draft: StoredExpenseDraft, options: ExpenseOptions, id: string): Promise<void>;
  /** Atomically freezes the body and puts it under C's crash-safe recovery. */
  prepare(record: QueuedExpense, payload: ExpenseCreateInput): Promise<boolean>;
  pause(record: QueuedExpense, reason: string, nextAt: number, attention?: boolean): Promise<void>;
  discard(record: QueuedExpense): Promise<void>;
  restore(record: QueuedExpense, draftId: string, discardCurrent?: boolean): Promise<void>;
}
type Row = {
  environment: string;
  account_id: string;
  client_request_id: string;
  trip_id: string;
  input: string;
  roster: string;
  status: string;
  reason: string | null;
  next_at: number;
  rate_limit_until: number;
  created_at: number;
};
const args = (r: PendingScope & { clientRequestId: string }) => [
  r.environment,
  r.accountId,
  r.clientRequestId,
];
const WHERE = 'environment = ? AND account_id = ? AND client_request_id = ?';
const editable = "status IN ('queued', 'attention', 'resolved')";

export async function createExpenseQueueStore(db: SqlDatabase): Promise<ExpenseQueueStore> {
  await migrateExpenseDatabase(db);
  const serial = <T>(fn: () => Promise<T>) => databaseTask(db, fn);
  const row = (r: QueuedExpense) =>
    db.getFirstAsync<Row>(`SELECT * FROM expense_queue WHERE ${WHERE}`, ...args(r));
  const requireEditable = async (r: QueuedExpense) => {
    const live = await row(r);
    if (!live || !['queued', 'attention', 'resolved'].includes(live.status))
      throw new Error('QUEUE_IMMUTABLE');
    if (live.trip_id !== r.tripId) throw new Error('QUEUE_CHANGED');
    return live;
  };
  return {
    rateLimitUntil: (scope) => serial(() => readExpenseRateLimit(db, scope)),
    list: (scope) =>
      serial(async () => {
        const rows = await db.getAllAsync<Row>(
          'SELECT * FROM expense_queue WHERE environment = ? AND account_id = ? ORDER BY created_at, client_request_id',
          scope.environment,
          scope.accountId
        );
        // Corruption fails closed, rather than hiding a record that could already have been sent.
        return rows.map((r) => ({
          ...scope,
          ...queueSchema.parse({
            clientRequestId: r.client_request_id,
            tripId: r.trip_id,
            input: JSON.parse(r.input),
            roster: JSON.parse(r.roster),
            status: r.status,
            reason: r.reason,
            nextAt: r.next_at,
            rateLimitUntil: r.rate_limit_until,
            createdAt: r.created_at,
          }),
        }));
      }),
    enqueue: (draft, options, id) =>
      serial(() =>
        transaction(db, async () => {
          z.uuid().parse(id);
          const roster = expenseOptionsSchema.parse(options).members.map((m) => m.id);
          const input = JSON.stringify(expenseDraftSchema.parse(draft.input));
          const live = await db.getFirstAsync<{
            draft_id: string;
            revision: number;
            input: string;
            status: string;
          }>(
            'SELECT draft_id, revision, input, status FROM expense_draft WHERE environment = ? AND account_id = ? AND trip_id = ?',
            draft.environment,
            draft.accountId,
            draft.tripId
          );
          if (
            !live ||
            live.status !== 'editing' ||
            live.draft_id !== draft.draftId ||
            live.revision !== draft.revision ||
            live.input !== input
          )
            throw new Error('DRAFT_CHANGED');
          await db.runAsync(
            "INSERT INTO expense_queue (environment, account_id, client_request_id, trip_id, input, roster, status, reason, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, 0, ?)",
            draft.environment,
            draft.accountId,
            id,
            draft.tripId,
            input,
            JSON.stringify(roster),
            Date.now()
          );
          // Tombstone the source generation in the same transaction, allowing the next raw draft.
          await db.runAsync(
            "UPDATE expense_draft SET status = 'discarded', input = '{}' WHERE environment = ? AND account_id = ? AND trip_id = ?",
            draft.environment,
            draft.accountId,
            draft.tripId
          );
        })
      ),
    prepare: (r, payload) =>
      serial(() =>
        transaction(db, async () => {
          const live = await row(r);
          if (!live || live.status !== 'queued' || live.trip_id !== r.tripId) return false;
          const body = expenseCreateInput.parse(payload);
          if (body.client_request_id !== r.clientRequestId) throw new Error('QUEUE_ID_CHANGED');
          // Wait behind C's unresolved request of this trip; no duplicate raw entry is created.
          const pending = await db.getFirstAsync(
            'SELECT 1 FROM pending_expense WHERE environment = ? AND account_id = ? AND trip_id = ?',
            r.environment,
            r.accountId,
            r.tripId
          );
          const mutation = await db.getFirstAsync(
            "SELECT 1 FROM pending_mutation WHERE environment = ? AND account_id = ? AND trip_id = ? AND status = 'pending'",
            r.environment,
            r.accountId,
            r.tripId
          );
          if (mutation) return false;
          if (pending) return false;
          await db.runAsync(
            "INSERT INTO pending_expense VALUES (?, ?, ?, ?, ?, 'sending', ?, ?)",
            ...args(r),
            r.tripId,
            JSON.stringify(body),
            r.createdAt,
            Date.now()
          );
          await db.runAsync(
            `UPDATE expense_queue SET status = 'prepared', reason = NULL, next_at = 0 WHERE ${WHERE}`,
            ...args(r)
          );
          return true;
        })
      ),
    pause: (r, reason, nextAt, attention = false) =>
      serial(async () => {
        await transaction(db, async () => {
          if (reason === 'busy') await extendExpenseRateLimit(db, r, nextAt);
          await db.runAsync(
            `UPDATE expense_queue SET reason = CASE WHEN status = 'prepared' AND reason = 'conflict' THEN reason ELSE ? END, next_at = MAX(next_at, ?), rate_limit_until = MAX(rate_limit_until, ?), status = CASE WHEN status = 'queued' AND ? = 1 THEN 'attention' ELSE status END WHERE ${WHERE} AND status IN ('queued', 'prepared')`,
            reason,
            nextAt,
            reason === 'busy' ? nextAt : 0,
            attention ? 1 : 0,
            ...args(r)
          );
        });
        if (reason === 'busy') rememberExpenseRateLimit(db, r, nextAt);
      }),
    discard: (r) =>
      serial(() =>
        transaction(db, async () => {
          await requireEditable(r);
          await db.runAsync(`DELETE FROM expense_queue WHERE ${WHERE} AND ${editable}`, ...args(r));
        })
      ),
    restore: (r, draftId, discardCurrent = false) =>
      serial(() =>
        transaction(db, async () => {
          z.uuid().parse(draftId);
          const live = await requireEditable(r);
          if (live.status === 'resolved') throw new Error('QUEUE_RESOLVED');
          const draft = await db.getFirstAsync<{ status: string }>(
            'SELECT status FROM expense_draft WHERE environment = ? AND account_id = ? AND trip_id = ?',
            r.environment,
            r.accountId,
            r.tripId
          );
          const pending = await db.getFirstAsync(
            'SELECT 1 FROM pending_expense WHERE environment = ? AND account_id = ? AND trip_id = ?',
            r.environment,
            r.accountId,
            r.tripId
          );
          if (
            pending ||
            draft?.status === 'handed-off' ||
            (draft?.status === 'editing' && !discardCurrent)
          )
            throw new Error('DRAFT_BLOCKED');
          await db.runAsync(
            `INSERT INTO expense_draft VALUES (?, ?, ?, ?, 1, ?, ?, 'editing', NULL) ON CONFLICT(environment, account_id, trip_id) DO UPDATE SET draft_id = excluded.draft_id, revision = 1, input = excluded.input, updated_at = excluded.updated_at, status = 'editing', client_request_id = NULL`,
            r.environment,
            r.accountId,
            r.tripId,
            draftId,
            live.input,
            Date.now()
          );
          await db.runAsync(`DELETE FROM expense_queue WHERE ${WHERE}`, ...args(r));
        })
      ),
  };
}
