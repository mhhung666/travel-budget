import { z } from 'zod';
import {
  tripUpdateInput,
  tripArchiveInput,
  tripCreateInput,
  tripJoinInput,
  mutationRequestSchema,
  expenseUpdateInput,
  expenseDeleteInput,
  paymentCreateInput,
  paymentDeleteInput,
  idSchema,
} from '@travel-budget/contracts';
import { databaseTask, migrateExpenseDatabase, transaction } from './expenseDatabase';
import {
  currentExpenseRateLimit,
  extendExpenseRateLimit,
  readExpenseRateLimit,
  rememberExpenseRateLimit,
} from './expenseRateLimit';
import type { PendingScope, SqlDatabase } from './pendingExpenses';

export const mutationPayload = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('trip.create'), body: tripCreateInput }),
  z.object({ operation: z.literal('trip.join'), body: tripJoinInput }),
  z.object({ operation: z.literal('trip.update'), tripId: idSchema, body: tripUpdateInput }),
  z.object({ operation: z.literal('trip.archive'), tripId: idSchema, body: tripArchiveInput }),
  z.object({
    operation: z.literal('expense.update'),
    tripId: idSchema,
    expenseId: idSchema,
    body: expenseUpdateInput,
  }),
  z.object({
    operation: z.literal('expense.delete'),
    tripId: idSchema,
    expenseId: idSchema,
    body: expenseDeleteInput,
  }),
  z.object({ operation: z.literal('payment.create'), tripId: idSchema, body: paymentCreateInput }),
  z.object({
    operation: z.literal('payment.delete'),
    tripId: idSchema,
    paymentId: idSchema,
    body: paymentDeleteInput,
  }),
]);
export type MutationPayload = z.infer<typeof mutationPayload>;
export interface PendingMutation extends PendingScope {
  clientRequestId: string;
  operation: MutationPayload['operation'];
  payload: MutationPayload | null;
  result: z.infer<typeof mutationRequestSchema> | null;
  status: 'pending' | 'completed';
  conflict: boolean;
  createdAt: number;
  tripId?: string | null;
}
export interface MutationStore {
  list(scope: PendingScope): Promise<PendingMutation[]>;
  get(scope: PendingScope, key: string): Promise<PendingMutation | null>;
  insert(record: PendingMutation): Promise<boolean>;
  conflict(scope: PendingScope, key: string): Promise<void>;
  complete(
    scope: PendingScope,
    key: string,
    result: z.infer<typeof mutationRequestSchema>
  ): Promise<void>;
  dismiss(scope: PendingScope, key: string): Promise<void>;
  retryAt(scope: PendingScope): Promise<number>;
  rateLimitUntil(scope: PendingScope): number;
  pause(scope: PendingScope, until: number): Promise<void>;
}
interface Row {
  environment: string;
  account_id: string;
  client_request_id: string;
  operation: MutationPayload['operation'];
  payload: string | null;
  result: string | null;
  status: PendingMutation['status'];
  conflict: number;
  created_at: number;
  trip_id: string | null;
}
function decode(row: Row): PendingMutation {
  const payload = row.payload ? mutationPayload.parse(JSON.parse(row.payload)) : null;
  if (
    row.status === 'pending' &&
    (!payload ||
      payload.body.client_request_id !== row.client_request_id ||
      payload.operation !== row.operation ||
      ('tripId' in payload ? payload.tripId : null) !== row.trip_id)
  )
    throw new Error('INVALID_MUTATION');
  return {
    environment: row.environment,
    accountId: row.account_id,
    clientRequestId: row.client_request_id,
    operation: row.operation,
    payload,
    result: row.result ? mutationRequestSchema.parse(JSON.parse(row.result)) : null,
    status: row.status,
    conflict: !!row.conflict,
    createdAt: row.created_at,
    tripId: row.trip_id,
  };
}
export async function createMutationStore(db: SqlDatabase): Promise<MutationStore> {
  await migrateExpenseDatabase(db);
  const serial = <T>(task: () => Promise<T>) => databaseTask(db, task);
  const scopeArgs = (scope: PendingScope) => [scope.environment, scope.accountId];
  return {
    list: (scope) =>
      serial(async () =>
        (
          await db.getAllAsync<Row>(
            'SELECT * FROM pending_mutation WHERE environment = ? AND account_id = ? ORDER BY created_at, client_request_id',
            ...scopeArgs(scope)
          )
        ).map(decode)
      ),
    get: (scope, key) =>
      serial(async () => {
        const row = await db.getFirstAsync<Row>(
          'SELECT * FROM pending_mutation WHERE environment = ? AND account_id = ? AND client_request_id = ?',
          ...scopeArgs(scope),
          key
        );
        return row ? decode(row) : null;
      }),
    insert: (record) =>
      serial(() =>
        transaction(db, async () => {
          const parsed = mutationPayload.parse(record.payload);
          if (parsed.body.client_request_id !== record.clientRequestId)
            throw new Error('INVALID_MUTATION');
          const tripId = 'tripId' in parsed ? parsed.tripId : null;
          const pending = tripId
            ? await db.getFirstAsync(
                "SELECT 1 FROM pending_mutation WHERE environment = ? AND account_id = ? AND trip_id = ? AND status = 'pending' UNION ALL SELECT 1 FROM pending_expense WHERE environment = ? AND account_id = ? AND trip_id = ?",
                ...scopeArgs(record),
                tripId,
                ...scopeArgs(record),
                tripId
              )
            : await db.getFirstAsync(
                "SELECT 1 FROM pending_mutation WHERE environment = ? AND account_id = ? AND operation = ? AND status = 'pending'",
                ...scopeArgs(record),
                record.operation
              );
          if (pending) return false;
          await db.runAsync(
            "INSERT INTO pending_mutation (environment, account_id, client_request_id, operation, payload, trip_id, status, conflict, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)",
            ...scopeArgs(record),
            record.clientRequestId,
            record.operation,
            JSON.stringify(parsed),
            tripId,
            record.createdAt
          );
          return true;
        })
      ),
    conflict: (scope, key) =>
      serial(async () => {
        await db.runAsync(
          'UPDATE pending_mutation SET conflict = 1 WHERE environment = ? AND account_id = ? AND client_request_id = ?',
          ...scopeArgs(scope),
          key
        );
      }),
    complete: (scope, key, result) =>
      serial(async () => {
        if (result.status === 'not_found') throw new Error('NOT_TERMINAL');
        await db.runAsync(
          "UPDATE pending_mutation SET status = 'completed', payload = CASE WHEN ? = 1 AND (operation LIKE 'expense.%' OR operation LIKE 'payment.%' OR operation IN ('trip.update', 'trip.archive')) THEN payload ELSE NULL END, result = ? WHERE environment = ? AND account_id = ? AND client_request_id = ?",
          result.status === 'rejected' ? 1 : 0,
          JSON.stringify(mutationRequestSchema.parse(result)),
          ...scopeArgs(scope),
          key
        );
      }),
    dismiss: (scope, key) =>
      serial(async () => {
        await db.runAsync(
          "DELETE FROM pending_mutation WHERE environment = ? AND account_id = ? AND client_request_id = ? AND status = 'completed'",
          ...scopeArgs(scope),
          key
        );
      }),
    retryAt: (scope) => serial(() => readExpenseRateLimit(db, scope)),
    rateLimitUntil: (scope) => currentExpenseRateLimit(db, scope),
    pause: (scope, until) =>
      serial(async () => {
        await transaction(db, () => extendExpenseRateLimit(db, scope, until));
        rememberExpenseRateLimit(db, scope, until);
      }),
  };
}
