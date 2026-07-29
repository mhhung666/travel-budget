import { describe, expect, it } from 'vitest';
import { generateStatsInsights } from '@/lib/statsInsights';
import type { ExpenseDetail, PersonalTripStat } from '@/types';

function detail(
  id: string,
  amount: number,
  category: string,
  date: string,
  tags: string[] = []
): ExpenseDetail {
  return {
    id,
    amount,
    category,
    date,
    tags,
    description: id,
    tripId: 'trip-1',
    tripName: 'Tokyo',
  };
}

function trip(
  details: ExpenseDetail[],
  overrides: Partial<PersonalTripStat> = {}
): PersonalTripStat {
  return {
    tripId: 'trip-1',
    tripName: 'Tokyo',
    total: details.reduce((sum, item) => sum + item.amount, 0),
    count: details.length,
    details,
    ...overrides,
  };
}

describe('advanced personal stats insight rules', () => {
  it('does not produce concentration insights for insufficient or zero-value samples', () => {
    const insufficient = trip([
      detail('one', 900, 'transportation', '2026-07-01'),
      detail('two', 100, 'food', '2026-07-02'),
    ]);
    const zero = trip([
      detail('one', 0, 'transportation', '2026-07-01'),
      detail('two', 0, 'food', '2026-07-02'),
      detail('three', 0, 'other', '2026-07-03'),
    ]);

    expect(generateStatsInsights({ tripStats: [insufficient, zero] })).toEqual([]);
  });

  it('creates deterministic filters and removes a duplicate one-expense peak day', () => {
    const insights = generateStatsInsights({
      tripStats: [
        trip([
          detail('flight', 600, 'transportation', '2026-07-01', ['flight']),
          detail('meal-1', 150, 'food', '2026-07-02', ['meal']),
          detail('meal-2', 150, 'food', '2026-07-03', ['meal']),
          detail('hotel', 100, 'accommodation', '2026-07-04', ['stay']),
        ]),
      ],
    });

    expect(insights.map((insight) => insight.type)).toEqual([
      'single_expense_concentration',
      'trip_category_concentration',
    ]);
    expect(insights[0]?.filter).toEqual({ tripId: 'trip-1', expenseId: 'flight' });
    expect(insights[1]?.filter).toEqual({
      tripId: 'trip-1',
      category: 'transportation',
    });
  });

  it('detects a multi-expense peak day and respects the global and per-trip limits', () => {
    const firstTrip = trip([
      detail('a', 300, 'food', '2026-07-01', ['fancy']),
      detail('b', 250, 'food', '2026-07-01', ['fancy']),
      detail('c', 250, 'transportation', '2026-07-02', ['fancy']),
      detail('d', 200, 'accommodation', '2026-07-03'),
    ]);
    const secondDetails = [
      { ...detail('e', 500, 'food', '2026-08-01'), tripId: 'trip-2', tripName: 'Osaka' },
      { ...detail('f', 200, 'food', '2026-08-02'), tripId: 'trip-2', tripName: 'Osaka' },
      {
        ...detail('g', 200, 'transportation', '2026-08-03'),
        tripId: 'trip-2',
        tripName: 'Osaka',
      },
      { ...detail('h', 100, 'other', '2026-08-04'), tripId: 'trip-2', tripName: 'Osaka' },
    ];

    const insights = generateStatsInsights({
      tripStats: [firstTrip, trip(secondDetails, { tripId: 'trip-2', tripName: 'Osaka' })],
    });

    expect(insights).toHaveLength(3);
    expect(
      Math.max(
        ...Array.from(
          insights
            .reduce(
              (counts, insight) =>
                counts.set(insight.tripId, (counts.get(insight.tripId) ?? 0) + 1),
              new Map<string, number>()
            )
            .values()
        )
      )
    ).toBeLessThanOrEqual(2);
    expect(insights).toContainEqual(
      expect.objectContaining({
        type: 'spending_day_concentration',
        filter: {
          tripId: 'trip-1',
          startDate: '2026-07-01',
          endDate: '2026-07-01',
        },
      })
    );
  });

  it('uses the balanced rule only when category concentration does not match', () => {
    const insights = generateStatsInsights({
      tripStats: [
        trip([
          detail('a', 25, 'food', '2026-07-01'),
          detail('b', 25, 'transportation', '2026-07-02'),
          detail('c', 25, 'accommodation', '2026-07-03'),
          detail('d', 25, 'shopping', '2026-07-04'),
        ]),
      ],
    });

    expect(insights.map((insight) => insight.type)).toContain('balanced_category_distribution');
    expect(insights.map((insight) => insight.type)).not.toContain('trip_category_concentration');
  });
});
