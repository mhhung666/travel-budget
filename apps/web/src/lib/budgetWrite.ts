import { isCentShare } from '@travel-budget/contracts';
import type { SetBudgetInput } from './validation';
import { ledgerStamp, LedgerError } from './ledger';

function normalizeBudgetAmounts(input: SetBudgetInput) {
  if (
    (input.total != null && !isCentShare(input.total)) ||
    (input.categories ?? []).some((c) => !isCentShare(c.amount))
  )
    throw new LedgerError('VALIDATION_ERROR');
}
export function normalizeBudget(input: SetBudgetInput) {
  normalizeBudgetAmounts(input);
  const total = input.total != null && input.total > 0 ? input.total : null;
  const byCategory = new Map<string, number>();
  for (const c of input.categories ?? []) if (c.amount > 0) byCategory.set(c.category, c.amount);
  const categories = Array.from(byCategory, ([category, amount]) => ({ category, amount }));
  const budget =
    total === null && !categories.length ? null : { ...ledgerStamp(), total, categories };
  return budget;
}
