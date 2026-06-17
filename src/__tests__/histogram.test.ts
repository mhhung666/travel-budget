import { describe, it, expect } from 'vitest';
import { aggregateExpensesByInterval, suggestInterval } from '@/lib/histogram';
import type { CategoryStat, ExpenseDetail } from '@/types';

// 以單一分類包裝給定的支出明細，方便組測資
function statsFrom(details: ExpenseDetail[]): CategoryStat[] {
  return [
    {
      category: 'food',
      total: details.reduce((s, d) => s + d.amount, 0),
      count: details.length,
      details,
    },
  ];
}

function expense(date: string, amount: number): ExpenseDetail {
  return { id: date, date, description: 'x', amount, tripName: 'trip' };
}

describe('suggestInterval', () => {
  it('suggests "day" for a range of 2 days or fewer', () => {
    expect(suggestInterval('2026-01-01', '2026-01-02')).toBe('day');
    expect(suggestInterval('2026-01-01', '2026-01-01')).toBe('day');
  });

  it('suggests "week" for ranges over 2 days up to 90 days', () => {
    expect(suggestInterval('2026-01-01', '2026-01-05')).toBe('week');
    expect(suggestInterval('2026-01-01', '2026-03-31')).toBe('week'); // 89 天
  });

  it('suggests "month" for ranges over 90 days', () => {
    expect(suggestInterval('2026-01-01', '2026-06-01')).toBe('month');
  });
});

describe('aggregateExpensesByInterval', () => {
  it('buckets expenses by day and totals each period', () => {
    const stats = statsFrom([
      expense('2026-01-01', 100),
      expense('2026-01-01', 50),
      expense('2026-01-03', 30),
    ]);

    const result = aggregateExpensesByInterval(stats, 'day', '2026-01-01', '2026-01-03', 'en');

    expect(result.interval).toBe('day');
    expect(result.dataPoints).toHaveLength(3); // 01, 02, 03
    expect(result.dataPoints[0]).toMatchObject({ amount: 150, count: 2 });
    expect(result.dataPoints[1]).toMatchObject({ amount: 0, count: 0 }); // 空日
    expect(result.dataPoints[2]).toMatchObject({ amount: 30, count: 1 });
  });

  it('totals amount and count across all periods', () => {
    const stats = statsFrom([
      expense('2026-01-01', 100),
      expense('2026-01-02', 200),
      expense('2026-01-03', 50),
    ]);

    const result = aggregateExpensesByInterval(stats, 'day', '2026-01-01', '2026-01-03', 'en');

    expect(result.totalAmount).toBe(350);
    expect(result.totalCount).toBe(3);
  });

  it('excludes expenses outside the requested date range', () => {
    const stats = statsFrom([
      expense('2025-12-31', 999), // 範圍外
      expense('2026-01-01', 100),
      expense('2026-01-04', 999), // 範圍外
    ]);

    const result = aggregateExpensesByInterval(stats, 'day', '2026-01-01', '2026-01-03', 'en');

    expect(result.totalAmount).toBe(100);
    expect(result.totalCount).toBe(1);
  });

  it('flattens expenses across multiple categories', () => {
    const stats: CategoryStat[] = [
      { category: 'food', total: 100, count: 1, details: [expense('2026-01-01', 100)] },
      { category: 'hotel', total: 200, count: 1, details: [expense('2026-01-01', 200)] },
    ];

    const result = aggregateExpensesByInterval(stats, 'day', '2026-01-01', '2026-01-01', 'en');

    expect(result.dataPoints).toHaveLength(1);
    expect(result.dataPoints[0]).toMatchObject({ amount: 300, count: 2 });
  });

  it('produces one data point per month for a monthly interval', () => {
    const stats = statsFrom([
      expense('2026-01-15', 100),
      expense('2026-02-15', 200),
      expense('2026-03-15', 300),
    ]);

    const result = aggregateExpensesByInterval(stats, 'month', '2026-01-01', '2026-03-31', 'en');

    expect(result.dataPoints).toHaveLength(3);
    expect(result.totalAmount).toBe(600);
    expect(result.totalCount).toBe(3);
  });

  it('returns no data points when start is after end', () => {
    const result = aggregateExpensesByInterval(
      statsFrom([expense('2026-01-01', 100)]),
      'day',
      '2026-01-05',
      '2026-01-01',
      'en'
    );
    expect(result.dataPoints).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('handles an empty stats array', () => {
    const result = aggregateExpensesByInterval([], 'day', '2026-01-01', '2026-01-02', 'en');
    expect(result.dataPoints).toHaveLength(2);
    expect(result.totalAmount).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});
