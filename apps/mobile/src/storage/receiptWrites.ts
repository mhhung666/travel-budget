import { z } from 'zod';
import { idSchema, receiptWriteInput, receiptWriteStateSchema } from '@travel-budget/contracts';
import type { PendingScope, SqlDatabase } from './pendingExpenses';
export const localReceiptWrite = z.object({
  tripId: idSchema,
  expenseId: idSchema,
  input: receiptWriteInput,
  file: z
    .string()
    .regex(/^[a-f0-9-]{36}$/)
    .optional(),
  cancel: z.boolean(),
  result: receiptWriteStateSchema.nullable(),
});
export type LocalReceiptWrite = z.infer<typeof localReceiptWrite>;
export interface ReceiptWriteStore {
  list(scope: PendingScope): Promise<LocalReceiptWrite[]>;
  save(scope: PendingScope, record: LocalReceiptWrite): Promise<void>;
  insert(scope: PendingScope, record: LocalReceiptWrite): Promise<void>;
  remove(scope: PendingScope, record: LocalReceiptWrite): Promise<void>;
  files(): Promise<string[]>;
}
export async function createReceiptWriteStore(db: SqlDatabase): Promise<ReceiptWriteStore> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS receipt_write (environment TEXT NOT NULL, account TEXT NOT NULL, trip TEXT NOT NULL, expense TEXT NOT NULL, body TEXT NOT NULL, uuid TEXT NOT NULL, PRIMARY KEY(environment, account, trip, expense))'
  );
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>) => {
    const task = tail.then(work);
    tail = task.catch(() => {});
    return task;
  };
  const values = (s: PendingScope, r: LocalReceiptWrite) => [
    s.environment,
    s.accountId,
    r.tripId,
    r.expenseId,
  ];
  const decode = (row: { body: string }) => localReceiptWrite.parse(JSON.parse(row.body));
  return {
    list: (s) =>
      run(async () =>
        (
          await db.getAllAsync<{ body: string }>(
            'SELECT body FROM receipt_write WHERE environment = ? AND account = ?',
            s.environment,
            s.accountId
          )
        ).map(decode)
      ),
    insert: (s, r) =>
      run(async () => {
        await db.runAsync(
          'INSERT INTO receipt_write (environment, account, trip, expense, body, uuid) VALUES (?, ?, ?, ?, ?, ?)',
          ...values(s, r),
          JSON.stringify(localReceiptWrite.parse(r)),
          r.input.client_request_id
        );
      }),
    save: (s, r) =>
      run(async () => {
        const row = await db.getFirstAsync<{ body: string }>(
          'SELECT body FROM receipt_write WHERE environment = ? AND account = ? AND trip = ? AND expense = ? AND uuid = ?',
          ...values(s, r),
          r.input.client_request_id
        );
        if (!row) throw new Error('RECEIPT_WRITE_CHANGED');
        const previous = decode(row);
        if (JSON.stringify(previous.input) !== JSON.stringify(r.input) || previous.file !== r.file)
          throw new Error('RECEIPT_WRITE_CHANGED');
        const next = {
          ...r,
          cancel: previous.cancel || r.cancel,
          result: previous.result ?? r.result,
        };
        await db.runAsync(
          'UPDATE receipt_write SET body = ? WHERE environment = ? AND account = ? AND trip = ? AND expense = ? AND uuid = ?',
          JSON.stringify(localReceiptWrite.parse(next)),
          ...values(s, r),
          r.input.client_request_id
        );
      }),
    remove: (s, r) =>
      run(async () => {
        await db.runAsync(
          'DELETE FROM receipt_write WHERE environment = ? AND account = ? AND trip = ? AND expense = ? AND uuid = ?',
          ...values(s, r),
          r.input.client_request_id
        );
      }),
    files: () =>
      run(async () =>
        (await db.getAllAsync<{ body: string }>('SELECT body FROM receipt_write'))
          .map(decode)
          .flatMap((r) => (r.file ? [r.file] : []))
      ),
  };
}
