import {
  budgetFieldsSchema,
  expenseCategories,
  type BudgetContext,
  type BudgetFields,
} from '@/api/contracts';
export interface BudgetForm {
  total: string;
  categories: Record<string, string>;
}
export function budgetForm(budget: BudgetContext['budget']): BudgetForm {
  return {
    total: budget?.total == null ? '' : String(budget.total),
    categories: Object.fromEntries(
      (budget?.categories ?? []).map((c) => [c.category, String(c.amount)])
    ),
  };
}
function amount(text: string) {
  const value = text.trim();
  if (!value) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('INVALID_BUDGET');
  return Number(value);
}
export function budgetValues(fields: BudgetForm): BudgetFields {
  const total = amount(fields.total);
  return budgetFieldsSchema.parse({
    total: total || null,
    categories: expenseCategories.flatMap((category) => {
      const value = amount(fields.categories[category] ?? '');
      return value === 0 ? [] : [{ category, amount: value }];
    }),
  });
}
/** Only fields explicitly changed since the viewed baseline survive a concurrent Web edit. */
export function rebaseBudget(
  previous: BudgetContext['budget'],
  fields: BudgetForm,
  latest: BudgetContext['budget']
): BudgetForm {
  const before = budgetForm(previous),
    next = budgetForm(latest);
  const same = (a: string, b: string) => {
    try {
      return amount(a) === amount(b);
    } catch {
      return a === b;
    }
  };
  if (!same(fields.total, before.total)) next.total = fields.total;
  for (const category of expenseCategories)
    if (!same(fields.categories[category] ?? '', before.categories[category] ?? ''))
      next.categories[category] = fields.categories[category] ?? '';
  return next;
}
