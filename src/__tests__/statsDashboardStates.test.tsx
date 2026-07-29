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

describe('personal statistics dashboard interactions', () => {
  it('lets mobile users switch dimensions and select an analysis row by tap', async () => {
    const user = userEvent.setup();
    const onViewStateChange = vi.fn();

    renderDashboard({ stats: populatedStats, onViewStateChange });

    await user.click(screen.getByRole('button', { name: /tripCount/ }));
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'trip',
      dimensionValue: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'dimensionTrip' }));
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'trip',
      dimensionValue: undefined,
    });

    await user.click(screen.getByRole('button', { name: /food/ }));
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimensionValue: 'food',
    });
  });

  it('sorts expense details and expands the full list without hover', async () => {
    const user = userEvent.setup();
    const details = Array.from({ length: 6 }, (_, index) => ({
      id: `expense-${index + 1}`,
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      description: `Expense ${index + 1}`,
      amount: (index + 1) * 100,
      tripName: 'Tokyo',
      tripId: 'trip-1',
      category: 'food',
    }));
    const stats: StatsData = {
      ...populatedStats,
      categoryStats: [
        {
          category: 'food',
          total: 2100,
          count: details.length,
          details,
        },
      ],
      totalAmount: 2100,
      totalExpenses: details.length,
      recentExpenses: details,
    };

    renderDashboard({ stats });

    expect(screen.queryByText('Expense 1')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'viewAll' }));
    expect(screen.queryByText('Expense 1')).not.toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: 'expenseSort' }), 'amountAsc');
    const expenseLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('?expense='));
    expect(expenseLinks[0].textContent).toContain('Expense 1');
    expect(expenseLinks[5].textContent).toContain('Expense 6');
    expect(details.map((detail) => detail.id)).toEqual([
      'expense-1',
      'expense-2',
      'expense-3',
      'expense-4',
      'expense-5',
      'expense-6',
    ]);
  });
});
