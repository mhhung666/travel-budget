import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsDashboard, { type StatsDashboardViewState } from '@/components/stats/StatsDashboard';
import type { StatsData } from '@/types';
import { generateStatsInsights, STATS_INSIGHT_RULE_VERSION } from '@/lib/statsInsights';

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
  detailFilters: {},
};

const emptyStats: StatsData = {
  categoryStats: [],
  tripStats: [],
  tagStats: [],
  totalAmount: 0,
  totalExpenses: 0,
  tripCount: 0,
  averagePerTrip: 0,
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  timeline: {
    interval: 'day',
    dataPoints: [],
    totalAmount: 0,
    totalCount: 0,
  },
  insights: [],
  insightRuleVersion: STATS_INSIGHT_RULE_VERSION,
};

const populatedStats: StatsData = {
  ...emptyStats,
  categoryStats: [
    {
      category: 'food',
      total: 500,
      count: 1,
    },
  ],
  tripStats: [
    {
      tripId: 'trip-1',
      tripName: 'Tokyo',
      total: 500,
      count: 1,
    },
  ],
  totalAmount: 500,
  totalExpenses: 1,
  tripCount: 1,
  averagePerTrip: 500,
  timeline: {
    interval: 'day',
    dataPoints: [
      {
        startDate: '2026-07-12',
        endDate: '2026-07-12',
        amount: 500,
        count: 1,
      },
    ],
    totalAmount: 500,
    totalCount: 1,
  },
};

function renderDashboard(overrides: Partial<React.ComponentProps<typeof StatsDashboard>> = {}) {
  const props: React.ComponentProps<typeof StatsDashboard> = {
    stats: emptyStats,
    loading: false,
    error: '',
    onRetry: vi.fn(),
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onYearSelect: vi.fn(),
    onClearDates: vi.fn(),
    viewState,
    onViewStateChange: vi.fn(),
    expenseDetails: [
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
    ...overrides,
  };
  return { ...render(<StatsDashboard {...props} />), props };
}

describe('personal statistics recovery states', () => {
  it('safely renders statistics restored from the pre-insights cache schema', () => {
    const legacyStats = {
      ...populatedStats,
      insights: undefined,
      insightRuleVersion: undefined,
    } as unknown as StatsData;

    expect(() => renderDashboard({ stats: legacyStats })).not.toThrow();
    expect(screen.queryByText('advancedInsight.heading')).toBeNull();
  });

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
      detailFilters: {},
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

    expect(screen.queryByText('averagePerTrip')).not.toBeNull();
    const tripInsight = screen
      .getAllByRole('button', { name: 'filterInsight' })
      .find((button) => button.textContent?.includes('Tokyo'));
    expect(tripInsight).toBeDefined();
    await user.click(tripInsight!);
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'trip',
      detailFilters: { tripId: 'trip-1' },
    });

    await user.click(screen.getByRole('button', { name: 'dimensionTrip' }));
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'trip',
    });

    await user.click(screen.getByRole('button', { name: /food/ }));
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      detailFilters: { category: 'food', expenseId: undefined },
    });
  });

  it('uses insight cards to filter the related details and marks the active insight', async () => {
    const user = userEvent.setup();
    const onViewStateChange = vi.fn();

    const { rerender, props } = renderDashboard({ stats: populatedStats, onViewStateChange });
    const categoryInsight = screen
      .getAllByRole('button', { name: 'filterInsight' })
      .find((button) => button.textContent?.includes('food'));
    expect(categoryInsight).toBeDefined();
    expect(categoryInsight!.getAttribute('aria-pressed')).toBe('false');

    await user.click(categoryInsight!);
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'category',
      detailFilters: { category: 'food' },
    });

    rerender(
      <StatsDashboard
        {...props}
        viewState={{ ...viewState, detailFilters: { category: 'food' } }}
        onViewStateChange={onViewStateChange}
      />
    );
    const selectedCategoryInsight = screen
      .getAllByRole('button', { name: 'filterInsight' })
      .find((button) => button.textContent?.includes('food'));
    expect(selectedCategoryInsight?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Dinner')).not.toBeNull();
  });

  it('requests the next cursor page and sends sorting changes to the query owner', async () => {
    const user = userEvent.setup();
    const onLoadMoreExpenseDetails = vi.fn();
    const onExpenseSortChange = vi.fn();
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
        },
      ],
      totalAmount: 2100,
      totalExpenses: details.length,
    };
    renderDashboard({
      stats,
      expenseDetails: details,
      expenseDetailsHasNextPage: true,
      onLoadMoreExpenseDetails,
      onExpenseSortChange,
    });

    expect(screen.queryByText('Expense 1')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'loadMoreExpenses' }));
    expect(onLoadMoreExpenseDetails).toHaveBeenCalledOnce();

    await user.selectOptions(screen.getByRole('combobox', { name: 'expenseSort' }), 'amountAsc');
    expect(onExpenseSortChange).toHaveBeenCalledWith('amountAsc');
  });

  it('renders the server-filtered intersection of trip and category details', () => {
    const stats: StatsData = {
      ...populatedStats,
      totalAmount: 1000,
      totalExpenses: 3,
    };

    renderDashboard({
      stats,
      expenseDetails: [
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
      viewState: {
        ...viewState,
        detailFilters: { tripId: 'trip-1', category: 'food' },
      },
    });

    expect(screen.queryByText('Dinner')).not.toBeNull();
    expect(screen.queryByText('Osaka lunch')).toBeNull();
    expect(screen.queryByText('Tokyo train')).toBeNull();
  });

  it('explains advanced insights and applies their complete detail filters', async () => {
    const user = userEvent.setup();
    const onViewStateChange = vi.fn();
    const details = [
      {
        id: 'flight',
        date: '2026-07-01',
        description: 'Flight',
        amount: 600,
        tripName: 'Tokyo',
        tripId: 'trip-1',
        category: 'transportation',
      },
      {
        id: 'meal-1',
        date: '2026-07-02',
        description: 'Lunch',
        amount: 150,
        tripName: 'Tokyo',
        tripId: 'trip-1',
        category: 'food',
      },
      {
        id: 'meal-2',
        date: '2026-07-03',
        description: 'Dinner',
        amount: 150,
        tripName: 'Tokyo',
        tripId: 'trip-1',
        category: 'food',
      },
      {
        id: 'hotel',
        date: '2026-07-04',
        description: 'Hotel',
        amount: 100,
        tripName: 'Tokyo',
        tripId: 'trip-1',
        category: 'accommodation',
      },
    ];
    const insightTripStats = [
      {
        tripId: 'trip-1',
        tripName: 'Tokyo',
        total: 1000,
        count: details.length,
        details,
      },
    ];
    const stats: StatsData = {
      ...populatedStats,
      tripStats: insightTripStats.map(({ tripId, tripName, total, count }) => ({
        tripId,
        tripName,
        total,
        count,
      })),
      totalAmount: 1000,
      totalExpenses: details.length,
    };
    stats.insights = generateStatsInsights({ tripStats: insightTripStats });

    const { rerender, props } = renderDashboard({
      stats,
      expenseDetails: details,
      onViewStateChange,
    });

    expect(screen.queryByText('advancedInsight.heading')).not.toBeNull();
    const calculationSummary = screen.getAllByText('advancedInsight.howCalculated')[0];
    await user.click(calculationSummary);
    expect(calculationSummary.closest('details')?.open).toBe(true);
    expect(screen.getAllByText('advancedInsight.concentrationCalculation')).not.toHaveLength(0);

    const detailButtons = screen.getAllByRole('button', {
      name: 'advancedInsight.viewDetailsLabel',
    });
    await user.click(detailButtons[0]);
    expect(onViewStateChange).toHaveBeenCalledWith({
      ...viewState,
      dimension: 'trip',
      detailFilters: {
        tripId: 'trip-1',
        category: undefined,
        tag: undefined,
        periodStart: undefined,
        periodEnd: undefined,
        expenseId: 'flight',
      },
    });

    rerender(
      <StatsDashboard
        {...props}
        stats={stats}
        viewState={{
          ...viewState,
          dimension: 'trip',
          detailFilters: { tripId: 'trip-1', expenseId: 'flight' },
        }}
        expenseDetails={[details[0]]}
      />
    );
    expect(
      screen
        .getAllByRole('button', { name: 'advancedInsight.viewDetailsLabel' })[0]
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.queryByText('Flight')).not.toBeNull();
    expect(screen.queryByText('Lunch')).toBeNull();
  });
});
