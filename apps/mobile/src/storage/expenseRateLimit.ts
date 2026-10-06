import type { PendingScope, SqlDatabase } from './pendingExpenses';

// A synchronous mirror for the final fetch guard. SQLite remains authoritative on restart.
// Stores sharing the database connection also share deadlines; rolled-back writes never publish.
const deadlines = new WeakMap<SqlDatabase, Map<string, number>>();
const keyOf = (scope: PendingScope) => JSON.stringify([scope.environment, scope.accountId]);
export function currentExpenseRateLimit(db: SqlDatabase, scope: PendingScope): number {
  return deadlines.get(db)?.get(keyOf(scope)) ?? 0;
}
export function rememberExpenseRateLimit(db: SqlDatabase, scope: PendingScope, until: number) {
  let values = deadlines.get(db);
  if (!values) deadlines.set(db, (values = new Map()));
  values.set(keyOf(scope), Math.max(values.get(keyOf(scope)) ?? 0, until));
}

/** Called inside the shared database serial queue / transaction. Independent of disposable rows. */
export async function readExpenseRateLimit(db: SqlDatabase, scope: PendingScope): Promise<number> {
  const until =
    (
      await db.getFirstAsync<{ rate_limit_until: number }>(
        'SELECT rate_limit_until FROM expense_rate_limit WHERE environment = ? AND account_id = ?',
        scope.environment,
        scope.accountId
      )
    )?.rate_limit_until ?? 0;
  rememberExpenseRateLimit(db, scope, until);
  return until;
}

/** A shorter wait, row removal, or receipt resolution must never clear the account deadline. */
export async function extendExpenseRateLimit(db: SqlDatabase, scope: PendingScope, until: number) {
  await db.runAsync(
    `INSERT INTO expense_rate_limit (environment, account_id, rate_limit_until) VALUES (?, ?, ?)
    ON CONFLICT(environment, account_id) DO UPDATE
      SET rate_limit_until = MAX(rate_limit_until, excluded.rate_limit_until)`,
    scope.environment,
    scope.accountId,
    until
  );
}
