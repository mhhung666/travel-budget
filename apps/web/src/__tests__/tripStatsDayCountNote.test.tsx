import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TripStatsView from '@/components/stats/TripStatsView';
import type { TripStatsData } from '@/types';

// 只驗證摘要區的天數說明與平均值尾數，圖表與排行不在範圍內。
vi.mock('@/components/stats/StatsSummaryCard', () => ({ default: () => null }));
vi.mock('@/components/stats/CategoryStats', () => ({ default: () => null }));
vi.mock('@/components/stats/TagStats', () => ({ default: () => null }));
vi.mock('@/components/stats/ExpenseHistogram', () => ({ default: () => null }));
vi.mock('@/components/stats/MemberSpendRanking', () => ({ default: () => null }));
vi.mock('@/components/stats/DailySpendCard', () => ({ default: () => null }));

afterEach(cleanup);

const base: TripStatsData = {
  categoryStats: [],
  tagStats: [],
  totalAmount: 123,
  totalExpenses: 1,
  memberSpends: [],
  memberCount: 2,
  dayCount: 1,
  dayCountSource: 'expenseDates',
  avgPerPersonPerDay: 61.5,
  dailySpend: [],
};

describe('TripStatsView day count note', () => {
  it('explains an undated trip counts days from expense dates and keeps decimals', () => {
    render(<TripStatsView stats={base} />);
    expect(screen.getByText('daysFromExpenseDates')).toBeInTheDocument();
    expect(screen.getByText(/61\.5/)).toBeInTheDocument();
  });

  it('shows no note when the trip has its own dates', () => {
    render(<TripStatsView stats={{ ...base, dayCount: 5, dayCountSource: 'tripDates' }} />);
    expect(screen.queryByText('daysFromExpenseDates')).not.toBeInTheDocument();
  });
});
