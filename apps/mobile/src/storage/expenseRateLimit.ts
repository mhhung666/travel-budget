import type { PendingScope, SqlDatabase } from './pendingExpenses';

/** Called inside the shared database serial queue / transaction. Independent of disposable rows. */
export async function readExpenseRateLimit(db: SqlDatabase, scope: PendingScope): Promise<number> {
  return (
    (
      await db.getFirstAsync<{ rate_limit_until: number }>(
        'SELECT rate_limit_until FROM expense_rate_limit WHERE environment = ? AND account_id = ?',
        scope.environment,
        scope.accountId
      )
    )?.rate_limit_until ?? 0
  );
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
