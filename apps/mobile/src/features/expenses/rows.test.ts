import { describe, expect, it } from 'vitest';
import { expenseCategories, type Expense } from '@/api/contracts';
import { messages } from '@/i18n/messages';
import { categoryLabel, isForeign, memberName, uniqueExpenses } from './rows';

const expense = (id: string, overrides: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-10-02',
  description: id,
  category: 'food',
  payerId: null,
  payerName: '',
  amount: 1,
  originalAmount: 1,
  currency: 'TWD',
  ...overrides,
});

describe('expense rows', () => {
  it('labels every category in all four languages', () => {
    for (const t of Object.values(messages))
      for (const category of expenseCategories) expect(categoryLabel(category, t)).toBeTruthy();
    expect(categoryLabel('food', messages.en)).toBe('Food & Dining');
    expect(categoryLabel('food', messages.zh)).toBe('餐飲');
    expect(categoryLabel('tickets', messages.jp)).toBe('チケット');
  });
  it('falls back to a localized label for members that no longer resolve', () => {
    expect(memberName('Amy', messages.en)).toBe('Amy');
    expect(memberName('', messages.en)).toBe('Unknown member');
    expect(memberName('', messages.zh)).toBe('未知成員');
  });
  it('treats every non-TWD expense as foreign', () => {
    expect(isForeign({ currency: 'TWD' })).toBe(false);
    expect(isForeign({ currency: 'JPY' })).toBe(true);
  });
  it('flattens pages without repeating an expense that moved between requests', () => {
    const first = expense('a', { description: 'newest copy' });
    const pages = [
      { items: [first, expense('b')] },
      { items: [expense('b', { description: 'stale copy' }), expense('c')] },
    ];
    expect(uniqueExpenses(pages).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    // The later duplicate overwrites the value but keeps the first position.
    expect(uniqueExpenses(pages)[1].description).toBe('stale copy');
    expect(uniqueExpenses([])).toEqual([]);
  });
});
