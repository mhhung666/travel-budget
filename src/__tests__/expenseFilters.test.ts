import { describe, it, expect } from 'vitest';
import {
  filterExpenses,
  countActiveFilters,
  EMPTY_EXPENSE_FILTERS,
  type ExpenseFilters,
} from '@/lib/expenseFilters';
import type { Expense } from '@/types';

/** 建立一筆最小可用的 Expense 測試資料，可覆寫任意欄位。 */
function mk(partial: Partial<Expense> & { id: string }): Expense {
  return {
    trip_id: 't1',
    payer_id: 'a',
    payer_name: 'Alice',
    amount: 100,
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    description: 'Something',
    category: 'food',
    date: '2026-06-10',
    created_at: '2026-06-10T00:00:00.000Z',
    splits: [{ user_id: 'a', username: 'alice', display_name: 'Alice', share_amount: 100 }],
    attachments: [],
    itinerary_day_ids: [],
    ...partial,
  };
}

const expenses: Expense[] = [
  mk({
    id: 'e1',
    description: 'Sushi dinner',
    category: 'food',
    payer_id: 'a',
    payer_name: 'Alice',
    date: '2026-06-01',
    splits: [
      { user_id: 'a', username: 'alice', display_name: 'Alice', share_amount: 50 },
      { user_id: 'b', username: 'bob', display_name: 'Bob', share_amount: 50 },
    ],
  }),
  mk({
    id: 'e2',
    description: 'Taxi to airport',
    category: 'transport',
    payer_id: 'b',
    payer_name: 'Bob',
    date: '2026-06-05',
    splits: [{ user_id: 'b', username: 'bob', display_name: 'Bob', share_amount: 100 }],
  }),
  mk({
    id: 'e3',
    description: 'Hotel stay',
    category: 'accommodation',
    payer_id: 'a',
    payer_name: 'Alice',
    date: '2026-06-10',
    splits: [
      { user_id: 'a', username: 'alice', display_name: 'Alice', share_amount: 60 },
      { user_id: 'c', username: 'carol', display_name: 'Carol', share_amount: 40 },
    ],
  }),
];

const ids = (list: Expense[]) => list.map((e) => e.id);

describe('filterExpenses', () => {
  it('returns all expenses when no filters are active', () => {
    expect(ids(filterExpenses(expenses, EMPTY_EXPENSE_FILTERS))).toEqual(['e1', 'e2', 'e3']);
  });

  it('preserves the original order', () => {
    const result = filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, payerId: 'a' });
    expect(ids(result)).toEqual(['e1', 'e3']);
  });

  describe('keyword', () => {
    it('matches the description case-insensitively', () => {
      expect(ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, keyword: 'SUSHI' }))).toEqual(
        ['e1']
      );
    });

    it('matches the payer name', () => {
      expect(ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, keyword: 'bob' }))).toEqual([
        'e2',
      ]);
    });

    it('trims surrounding whitespace', () => {
      expect(
        ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, keyword: '  hotel  ' }))
      ).toEqual(['e3']);
    });

    it('returns nothing when no description or payer matches', () => {
      expect(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, keyword: 'zzz' })).toEqual([]);
    });
  });

  it('filters by category', () => {
    expect(
      ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, category: 'transport' }))
    ).toEqual(['e2']);
  });

  it('filters by payer', () => {
    expect(ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, payerId: 'b' }))).toEqual([
      'e2',
    ]);
  });

  it('filters by split participant (not the payer)', () => {
    // Carol only appears in e3 as a participant, never as a payer.
    expect(ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, participantId: 'c' }))).toEqual(
      ['e3']
    );
    // Bob participates in e1 (split) and e2 (payer + split).
    expect(ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, participantId: 'b' }))).toEqual(
      ['e1', 'e2']
    );
  });

  describe('date range (inclusive)', () => {
    it('filters by start date only', () => {
      expect(
        ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, dateFrom: '2026-06-05' }))
      ).toEqual(['e2', 'e3']);
    });

    it('filters by end date only', () => {
      expect(
        ids(filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, dateTo: '2026-06-05' }))
      ).toEqual(['e1', 'e2']);
    });

    it('filters by both bounds and includes the boundary dates', () => {
      expect(
        ids(
          filterExpenses(expenses, {
            ...EMPTY_EXPENSE_FILTERS,
            dateFrom: '2026-06-01',
            dateTo: '2026-06-05',
          })
        )
      ).toEqual(['e1', 'e2']);
    });

    it('tolerates an ISO date-time value on the expense', () => {
      const withTime = [mk({ id: 'x', date: '2026-06-07T15:30:00.000Z' })];
      expect(
        ids(
          filterExpenses(withTime, {
            ...EMPTY_EXPENSE_FILTERS,
            dateFrom: '2026-06-07',
            dateTo: '2026-06-07',
          })
        )
      ).toEqual(['x']);
    });
  });

  it('combines multiple filters with AND', () => {
    const filters: ExpenseFilters = {
      ...EMPTY_EXPENSE_FILTERS,
      payerId: 'a',
      category: 'accommodation',
    };
    expect(ids(filterExpenses(expenses, filters))).toEqual(['e3']);
  });

  it('returns an empty array when filters conflict', () => {
    // Alice never paid for a transport expense.
    expect(
      filterExpenses(expenses, { ...EMPTY_EXPENSE_FILTERS, payerId: 'a', category: 'transport' })
    ).toEqual([]);
  });
});

describe('countActiveFilters', () => {
  it('is zero for the empty filter set', () => {
    expect(countActiveFilters(EMPTY_EXPENSE_FILTERS)).toBe(0);
  });

  it('ignores whitespace-only keywords', () => {
    expect(countActiveFilters({ ...EMPTY_EXPENSE_FILTERS, keyword: '   ' })).toBe(0);
  });

  it('counts the date range as a single filter', () => {
    expect(
      countActiveFilters({ ...EMPTY_EXPENSE_FILTERS, dateFrom: '2026-06-01', dateTo: '2026-06-30' })
    ).toBe(1);
    expect(countActiveFilters({ ...EMPTY_EXPENSE_FILTERS, dateFrom: '2026-06-01' })).toBe(1);
  });

  it('counts each active dimension', () => {
    expect(
      countActiveFilters({
        keyword: 'sushi',
        category: 'food',
        payerId: 'a',
        participantId: 'b',
        dateFrom: '2026-06-01',
        dateTo: '',
      })
    ).toBe(5);
  });
});
