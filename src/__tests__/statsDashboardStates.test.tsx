import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsDashboard, { type StatsDashboardViewState } from '@/components/stats/StatsDashboard';
import type { StatsData } from '@/types';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/stats/DateRangeFilter', () => ({
  default: () => <div data-testid="date-filter" />,
}));

vi.mock('@/components/stats/ExpenseHistogram', () => ({
  default: () => <div data-testid="expense-histogram" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const viewState: StatsDashboardViewState = {
  dimension: 'category',
  metric: 'amount',
  interval: 'day',
  selectedPeriod: null,
};

const emptyStats: StatsData = {
  categoryStats: [],
  tripStats: [],
  tagStats: [],
  totalAmount: 0,
  totalExpenses: 0,
  tripCount: 0,
  dailyAverage: 0,
  dayCount: 0,
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  recentExpenses: [],
  comparison: null,
};

const populatedStats: StatsData = {
  ...emptyStats,
  categoryStats: [
    {
      category: 'food',
      total: 500,
      count: 1,
      details: [
        {
          id: 'expense-1',
          date: '2026-07-12',
          description: 'Dinner',
          amount: 500,
          tripName: 'Tokyo',
          tripId: 'trip-1',
          category: 'food',
        },
      ],
    },
  ],
  tripStats: [
    {
      tripId: 'trip-1',
      tripName: 'Tokyo',
      total: 500,
      count: 1,
      details: [],
    },
  ],
  totalAmount: 500,
  totalExpenses: 1,
  tripCount: 1,
  dailyAverage: 16,
  dayCount: 31,
  recentExpenses: [
    {
      id: 'expense-1',
      date: '2026-07-12',
      description: 'Dinner',
      amount: 500,
      tripName: 'Tokyo',
      tripId: 'trip-1',
      category: 'food',
    },
  ],
};

function renderDashboard(overrides: Partial<React.ComponentProps<typeof StatsDashboard>> = {}) {
  const props: React.ComponentProps<typeof StatsDashboard> = {
    stats: emptyStats,
    loading: false,
    error: '',
    onRetry: vi.fn(),
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    compare: true,
    onCompareChange: vi.fn(),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onYearSelect: vi.fn(),
    onClearDates: vi.fn(),
    viewState,
    onViewStateChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<StatsDashboard {...props} />), props };
}

describe('personal statistics recovery states', () => {
  it('shows an actionable retry state when the initial request fails', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderDashboard({ stats: null, error: 'INTERNAL_ERROR', onRetry });

    expect(screen.queryByText('loadErrorTitle')).not.toBeNull();
    expect(screen.queryByText('INTERNAL_ERROR')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers quick add and all-time actions when a period has no expenses', async () => {
    const user = userEvent.setup();
    const onClearDates = vi.fn();
    const onViewStateChange = vi.fn();

    renderDashboard({ onClearDates, onViewStateChange });

    expect(screen.queryByText('emptyPeriodTitle')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'logExpense' }).getAttribute('href')).toBe(
      '/quick-add'
    );
    await user.click(screen.getByRole('button', { name: 'viewAllTime' }));
    expect(onClearDates).toHaveBeenCalledOnce();
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimensionValue: undefined,
      selectedPeriod: null,
    });
  });

  it('keeps stale data visible and allows retry after a background failure', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderDashboard({ stats: populatedStats, error: 'INTERNAL_ERROR', onRetry });

    expect(screen.queryByText('updateErrorTitle')).not.toBeNull();
    expect(screen.queryByTestId('expense-histogram')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
