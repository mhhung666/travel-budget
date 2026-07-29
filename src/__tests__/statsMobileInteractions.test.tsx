import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRangeFilter from '@/components/stats/DateRangeFilter';
import ExpenseHistogram from '@/components/stats/ExpenseHistogram';
import type { CategoryStat } from '@/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = (key: string) => key;

describe('personal statistics mobile date controls', () => {
  it('keeps every preset keyboard-operable with a mobile-sized touch target', async () => {
    const user = userEvent.setup();
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    const onClearDates = vi.fn();

    render(
      <DateRangeFilter
        startDate="2026-07-01"
        endDate="2026-07-31"
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onYearSelect={vi.fn()}
        onClearDates={onClearDates}
        compare
        onCompareChange={vi.fn()}
        t={t}
      />
    );

    const preset = screen.getByRole('button', { name: 'last30Days' });
    expect(preset.className).toContain('min-h-11');
    preset.focus();
    await user.keyboard('{Enter}');
    expect(onStartDateChange).toHaveBeenCalledOnce();
    expect(onEndDateChange).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'allTime' }));
    expect(onClearDates).toHaveBeenCalledOnce();
  });

  it('labels custom date inputs and keeps comparison state operable without hover', async () => {
    const user = userEvent.setup();
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    const onCompareChange = vi.fn();

    render(
      <DateRangeFilter
        startDate="2026-07-01"
        endDate="2026-07-31"
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        onYearSelect={vi.fn()}
        onClearDates={vi.fn()}
        compare
        onCompareChange={onCompareChange}
        t={t}
      />
    );

    fireEvent.change(screen.getByLabelText('startDate'), { target: { value: '2026-07-05' } });
    fireEvent.change(screen.getByLabelText('endDate'), { target: { value: '2026-07-20' } });
    expect(onStartDateChange).toHaveBeenCalledWith('2026-07-05');
    expect(onEndDateChange).toHaveBeenCalledWith('2026-07-20');
    expect(screen.getByLabelText('startDate').parentElement?.className).toContain('grid-cols-1');

    await user.click(screen.getByRole('checkbox', { name: 'comparePrevious' }));
    expect(onCompareChange).toHaveBeenCalledWith(false);
  });

  it('disables comparison when the selected period is incomplete', () => {
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        onYearSelect={vi.fn()}
        onClearDates={vi.fn()}
        compare={false}
        onCompareChange={vi.fn()}
        t={t}
      />
    );

    expect(
      (screen.getByRole('checkbox', { name: 'comparePrevious' }) as HTMLInputElement).disabled
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'allTime' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });
});

const categoryStats: CategoryStat[] = [
  {
    category: 'food',
    total: 300,
    count: 2,
    details: [
      {
        id: 'expense-1',
        date: '2026-07-01',
        description: 'Breakfast',
        amount: 100,
        tripName: 'Tokyo',
      },
      {
        id: 'expense-2',
        date: '2026-07-02',
        description: 'Dinner',
        amount: 200,
        tripName: 'Tokyo',
      },
    ],
  },
];

describe('personal statistics mobile chart controls', () => {
  it('supports tap selection, deselection, metric changes, and interval changes', async () => {
    const user = userEvent.setup();
    const onMetricChange = vi.fn();
    const onIntervalChange = vi.fn();
    const onPeriodSelect = vi.fn();

    const { rerender } = render(
      <ExpenseHistogram
        categoryStats={categoryStats}
        startDate="2026-07-01"
        endDate="2026-07-07"
        formatCurrency={(amount) => `$${amount}`}
        t={t}
        locale="zh-TW"
        metric="amount"
        interval="day"
        onMetricChange={onMetricChange}
        onIntervalChange={onIntervalChange}
        onPeriodSelect={onPeriodSelect}
      />
    );

    await user.click(screen.getByRole('button', { name: 'countMetric' }));
    expect(onMetricChange).toHaveBeenCalledWith('count');
    await user.click(screen.getByRole('button', { name: 'intervalWeek' }));
    expect(onIntervalChange).toHaveBeenCalledWith('week');

    const firstPoint = screen
      .getAllByRole('button', { pressed: false })
      .find((button) => button.textContent?.includes('$100'));
    expect(firstPoint).toBeDefined();
    await user.click(firstPoint!);
    expect(onPeriodSelect).toHaveBeenCalledWith({
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });

    rerender(
      <ExpenseHistogram
        categoryStats={categoryStats}
        startDate="2026-07-01"
        endDate="2026-07-07"
        formatCurrency={(amount) => `$${amount}`}
        t={t}
        locale="zh-TW"
        metric="amount"
        interval="day"
        selectedPeriod={{ startDate: '2026-07-01', endDate: '2026-07-01' }}
        onMetricChange={onMetricChange}
        onIntervalChange={onIntervalChange}
        onPeriodSelect={onPeriodSelect}
      />
    );
    await user.click(screen.getByText('$100').closest('button')!);
    expect(onPeriodSelect).toHaveBeenLastCalledWith(null);
    expect(
      (screen.getByRole('button', { name: 'intervalMonth' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('exposes horizontally scrollable chart regions to touch and keyboard users', () => {
    render(
      <ExpenseHistogram
        categoryStats={categoryStats}
        startDate="2026-07-01"
        endDate="2026-07-31"
        formatCurrency={(amount) => `$${amount}`}
        t={t}
        locale="zh-TW"
      />
    );

    const chartRegion = screen.getByRole('region', { name: 'expenseHistogram' });
    const dataRegion = screen.getByRole('region', { name: 'chartData' });
    expect(screen.getByLabelText('metric').className).toContain('grid-cols-2');
    expect(screen.getByLabelText('interval').className).toContain('grid-cols-3');
    for (const region of [chartRegion, dataRegion]) {
      expect(region.getAttribute('tabindex')).toBe('0');
      expect(region.className).toContain('touch-pan-x');
      expect(region.className).toContain('overflow-x-auto');
    }
  });
});
