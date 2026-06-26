import { describe, it, expect } from 'vitest';
import { computeBudgetProgress } from '@/lib/budget';
import type { Budget } from '@/types';

describe('computeBudgetProgress', () => {
  it('reports no budget when budget is null', () => {
    const result = computeBudgetProgress(null, []);
    expect(result).toEqual({
      total: null,
      totalSpent: 0,
      categories: [],
      hasBudget: false,
    });
  });

  it('still totals spending when no budget is set', () => {
    const result = computeBudgetProgress(null, [
      { amount: 1000, category: 'food' },
      { amount: 500, category: 'food' },
      { amount: 2000, category: 'accommodation' },
    ]);
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
    const result = computeBudgetProgress(budget, [{ amount: 4000, category: 'food' }]);
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
    const result = computeBudgetProgress(budget, [
      { amount: 4200, category: 'food' }, // over its 4000 budget
      { amount: 5000, category: 'accommodation' },
    ]);
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
    const result = computeBudgetProgress(budget, [{ amount: 300, category: 'transportation' }]);
    // food (budgeted, no spend) + transportation (spent, no budget)
    expect(result.categories).toEqual([
      { category: 'transportation', budget: null, spent: 300 },
      { category: 'food', budget: 4000, spent: 0 },
    ]);
  });

  it('rounds amounts to whole numbers (base currency has no decimals)', () => {
    const budget: Budget = { total: 1000, categories: [{ category: 'food', amount: 500 }] };
    const result = computeBudgetProgress(budget, [
      { amount: 100.4, category: 'food' },
      { amount: 100.4, category: 'food' },
    ]);
    expect(result.totalSpent).toBe(201);
    expect(result.categories[0]).toEqual({ category: 'food', budget: 500, spent: 201 });
  });

  it('treats missing/empty category as "other"', () => {
    const result = computeBudgetProgress(null, [
      { amount: 50, category: '' },
      { amount: 50, category: 'other' },
    ]);
    expect(result.categories).toEqual([{ category: 'other', budget: null, spent: 100 }]);
  });
});
