import { z } from 'zod';
import { avatarWriteInput, avatarWriteStateSchema } from '@travel-budget/contracts';
import type { PendingScope, SqlDatabase } from './pendingExpenses';
export const localAvatarWrite = z.object({
  input: avatarWriteInput,
  file: z
    .string()
    .regex(/^[a-f0-9-]{36}$/)
    .optional(),
  cancel: z.boolean(),
  result: avatarWriteStateSchema.nullable(),
});
export type LocalAvatarWrite = z.infer<typeof localAvatarWrite>;
export interface AvatarWriteStore {
  list(scope: PendingScope): Promise<LocalAvatarWrite[]>;
  save(scope: PendingScope, record: LocalAvatarWrite): Promise<void>;
  insert(scope: PendingScope, record: LocalAvatarWrite): Promise<void>;
  remove(scope: PendingScope, record: LocalAvatarWrite): Promise<void>;
  files(): Promise<string[]>;
}
export async function createAvatarWriteStore(db: SqlDatabase): Promise<AvatarWriteStore> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS avatar_write (environment TEXT NOT NULL, account TEXT NOT NULL, body TEXT NOT NULL, uuid TEXT NOT NULL, PRIMARY KEY(environment, account))'
  );
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>) => {
    const task = tail.then(work);
    tail = task.catch(() => {});
    return task;
  };
  const values = (s: PendingScope) => [s.environment, s.accountId];
  const decode = (row: { body: string }) => localAvatarWrite.parse(JSON.parse(row.body));
  return {
    list: (s) =>
      run(async () =>
        (
          await db.getAllAsync<{ body: string }>(
            'SELECT body FROM avatar_write WHERE environment = ? AND account = ?',
            s.environment,
            s.accountId
          )
        ).map(decode)
      ),
    insert: (s, r) =>
      run(async () => {
        await db.runAsync(
          'INSERT INTO avatar_write (environment, account, body, uuid) VALUES (?, ?, ?, ?)',
          ...values(s),
          JSON.stringify(localAvatarWrite.parse(r)),
          r.input.client_request_id
        );
      }),
    save: (s, r) =>
      run(async () => {
        const row = await db.getFirstAsync<{ body: string }>(
          'SELECT body FROM avatar_write WHERE environment = ? AND account = ? AND uuid = ?',
          ...values(s),
          r.input.client_request_id
        );
        if (!row) throw new Error('AVATAR_WRITE_CHANGED');
        const previous = decode(row);
        if (JSON.stringify(previous.input) !== JSON.stringify(r.input) || previous.file !== r.file)
          throw new Error('AVATAR_WRITE_CHANGED');
        const next = {
          ...r,
          cancel: previous.cancel || r.cancel,
          result: previous.result ?? r.result,
        };
        await db.runAsync(
          'UPDATE avatar_write SET body = ? WHERE environment = ? AND account = ? AND uuid = ?',
          JSON.stringify(localAvatarWrite.parse(next)),
          ...values(s),
          r.input.client_request_id
        );
      }),
    remove: (s, r) =>
      run(async () => {
        await db.runAsync(
          'DELETE FROM avatar_write WHERE environment = ? AND account = ? AND uuid = ?',
          ...values(s),
          r.input.client_request_id
        );
      }),
    files: () =>
      run(async () =>
        (await db.getAllAsync<{ body: string }>('SELECT body FROM avatar_write'))
          .map(decode)
          .flatMap((r) => (r.file ? [r.file] : []))
      ),
  };
}
