import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuleBasedInsights from '@/components/stats/RuleBasedInsights';
import type { StatsData, StatsInsight } from '@/types';

vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));

const t = ((key: string) => key) as unknown as Parameters<typeof RuleBasedInsights>[0]['t'];

function insight(tripStartDate: string | null): StatsInsight {
  return {
    id: 'category:trip-1:transportation',
    type: 'trip_category_concentration',
    tripId: 'trip-1',
    tripName: 'Tokyo',
    tripStartDate,
    amount: 870,
    totalAmount: 1000,
    percentage: 0.87,
    sampleSize: 3,
    category: 'transportation',
    filter: { tripId: 'trip-1', category: 'transportation' },
  };
}

function renderWith(item: StatsInsight) {
  render(
    <RuleBasedInsights
      stats={{ insights: [item] } as unknown as StatsData}
      t={t}
      categoryName={(key) => key}
      formatCurrency={(amount) => String(amount)}
      formatDate={(date) => date}
      activeFilters={{}}
      onSelect={() => undefined}
    />
  );
}

describe('RuleBasedInsights pre-trip note', () => {
  afterEach(() => vi.useRealTimers());

  it('flags insights for trips that have not started yet', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 17));
    renderWith(insight('2026-10-01'));
    expect(screen.getByText('advancedInsight.preTripNote')).toBeInTheDocument();
  });

  it('does not flag trips that already started or have no start date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 17));
    renderWith(insight('2026-09-10'));
    renderWith(insight(null));
    expect(screen.queryByText('advancedInsight.preTripNote')).not.toBeInTheDocument();
  });
});
