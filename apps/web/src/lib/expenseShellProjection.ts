import type { TripShell } from '@/types';

export type ExpenseShellDelta = Pick<TripShell, 'expense_count' | 'total_spent' | 'today_spent'>;

/** Client-only provenance travels with the cached value, so a server refetch replaces it. */
export type ProjectedExpenseShell = TripShell & {
  expenseProjection?: {
    base: TripShell;
    contributions: Record<string, ExpenseShellDelta>;
  };
};

export function expenseShellDelta(previous: TripShell, applied: TripShell): ExpenseShellDelta {
  return {
    expense_count: applied.expense_count - previous.expense_count,
    total_spent: applied.total_spent - previous.total_spent,
    today_spent: applied.today_spent - previous.today_spent,
  };
}

export function projectExpenseShell(
  base: TripShell,
  contributions: Record<string, ExpenseShellDelta>
): ProjectedExpenseShell {
  if (!Object.keys(contributions).length) return base;
  const totals = Object.values(contributions).reduce(
    (sum, delta) => ({
      expense_count: sum.expense_count + delta.expense_count,
      total_spent: sum.total_spent + delta.total_spent,
      today_spent: sum.today_spent + delta.today_spent,
    }),
    {
      expense_count: base.expense_count,
      total_spent: base.total_spent,
      today_spent: base.today_spent,
    }
  );
  return { ...base, ...totals, expenseProjection: { base, contributions } };
}

export function addExpenseShellProjection(
  shell: ProjectedExpenseShell,
  requestId: string,
  delta: ExpenseShellDelta
): ProjectedExpenseShell {
  return projectExpenseShell(shell.expenseProjection?.base ?? shell, {
    ...shell.expenseProjection?.contributions,
    [requestId]: delta,
  });
}

export function removeExpenseShellProjection(
  shell: ProjectedExpenseShell,
  requestId: string
): ProjectedExpenseShell {
  if (!shell.expenseProjection?.contributions[requestId]) return shell;
  const contributions = { ...shell.expenseProjection.contributions };
  delete contributions[requestId];
  return projectExpenseShell(shell.expenseProjection.base, contributions);
}
