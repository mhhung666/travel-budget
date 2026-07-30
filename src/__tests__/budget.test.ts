import { describe, it, expect } from 'vitest';
import { computeBudgetProgress } from '@/lib/budget';
import type { Budget } from '@/types';

describe('computeBudgetProgress', () => {
  const expense = (
    category: string,
    mine: number,
    others = 0
  ): { category: string; splits: { user_id: string; share_amount: number }[] } => ({
    category,
    splits: [
      { user_id: 'me', share_amount: mine },
      ...(others > 0 ? [{ user_id: 'other', share_amount: others }] : []),
    ],
  });

  it('reports no budget when budget is null', () => {
    const result = computeBudgetProgress(null, [], 'me');
    expect(result).toEqual({
      total: null,
      totalSpent: 0,
      categories: [],
      hasBudget: false,
    });
  });

  it('still totals spending when no budget is set', () => {
    const result = computeBudgetProgress(
      null,
      [expense('food', 1000, 2000), expense('food', 500), expense('accommodation', 2000, 4000)],
      'me'
    );
    expect(result.hasBudget).toBe(false);
    expect(result.total).toBeNull();
    expect(result.totalSpent).toBe(3500);
    // categories with spending are listed (budget null), ordered by CATEGORY_CODES
    expect(result.categories).toEqual([
      { category: 'accommodation', budget: null, spent: 2000 },
      { category: 'food', budget: null, spent: 1500 },
    ]);
  });

  it('computes progress for an overall total budget', () => {
    const budget: Budget = { total: 10000, categories: [] };
    const result = computeBudgetProgress(budget, [expense('food', 4000, 8000)], 'me');
    expect(result.hasBudget).toBe(true);
    expect(result.total).toBe(10000);
    expect(result.totalSpent).toBe(4000);
  });

  it('computes per-category budgets and spending', () => {
    const budget: Budget = {
      total: null,
      categories: [
        { category: 'food', amount: 4000 },
        { category: 'accommodation', amount: 8000 },
      ],
    };
    const result = computeBudgetProgress(
      budget,
      [
        expense('food', 4200, 1000), // my share is over my 4000 budget
        expense('accommodation', 5000, 9000),
      ],
      'me'
    );
    expect(result.hasBudget).toBe(true);
    expect(result.total).toBeNull();
    expect(result.totalSpent).toBe(9200);
    expect(result.categories).toEqual([
      { category: 'accommodation', budget: 8000, spent: 5000 },
      { category: 'food', budget: 4000, spent: 4200 },
    ]);
  });

  it('unions budgeted and spent categories, ordered by category order', () => {
    const budget: Budget = {
      total: null,
      categories: [{ category: 'food', amount: 4000 }],
    };
    const result = computeBudgetProgress(budget, [expense('transportation', 300)], 'me');
    // food (budgeted, no spend) + transportation (spent, no budget)
    expect(result.categories).toEqual([
      { category: 'transportation', budget: null, spent: 300 },
      { category: 'food', budget: 4000, spent: 0 },
    ]);
  });

  it('rounds amounts to whole numbers (base currency has no decimals)', () => {
    const budget: Budget = { total: 1000, categories: [{ category: 'food', amount: 500 }] };
    const result = computeBudgetProgress(
      budget,
      [expense('food', 100.4), expense('food', 100.4)],
      'me'
    );
    expect(result.totalSpent).toBe(201);
    expect(result.categories[0]).toEqual({ category: 'food', budget: 500, spent: 201 });
  });

  it('treats missing/empty category as "other"', () => {
    const result = computeBudgetProgress(null, [expense('', 50), expense('other', 50)], 'me');
    expect(result.categories).toEqual([{ category: 'other', budget: null, spent: 100 }]);
  });

  it('ignores expenses not split to the current user', () => {
    const result = computeBudgetProgress(
      { total: 1000, categories: [] },
      [
        { category: 'food', splits: [{ user_id: 'other', share_amount: 900 }] },
        expense('transportation', 100, 400),
      ],
      'me'
    );
    expect(result.totalSpent).toBe(100);
    expect(result.categories).toEqual([
      { category: 'transportation', budget: null, spent: 100 },
      { category: 'food', budget: null, spent: 0 },
    ]);
  });

  it('does not expose spending before the current user is known', () => {
    const result = computeBudgetProgress(null, [expense('food', 500)], null);
    expect(result.totalSpent).toBe(0);
  });
});
