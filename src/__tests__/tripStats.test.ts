import { describe, it, expect } from 'vitest';
import {
  computeTripStats,
  type TripStatsDay,
  type TripStatsExpense,
  type TripStatsMember,
} from '@/lib/tripStats';

const members: TripStatsMember[] = [
  { userId: 'a', name: 'Alice' },
  { userId: 'b', name: 'Bob' },
  { userId: 'c', name: 'Charlie' },
];

const expenses: TripStatsExpense[] = [
  {
    id: 'e1',
    category: 'food',
    date: '2026-06-01',
    description: 'Dinner',
    amount: 300,
    payerId: 'a',
    payerName: 'Alice',
    splits: [
      { userId: 'a', shareAmount: 100 },
      { userId: 'b', shareAmount: 100 },
      { userId: 'c', shareAmount: 100 },
    ],
  },
  {
    id: 'e2',
    category: 'transportation',
    date: '2026-06-02',
    description: 'Taxi',
    amount: 200,
    payerId: 'b',
    payerName: 'Bob',
    splits: [
      { userId: 'a', shareAmount: 100 },
      { userId: 'b', shareAmount: 100 },
    ],
  },
  {
    id: 'e3',
    category: 'food',
    date: '2026-06-03',
    description: 'Snacks',
    amount: 60,
    payerId: 'a',
    payerName: 'Alice',
    splits: [{ userId: 'a', shareAmount: 60 }],
  },
];

describe('computeTripStats', () => {
  it('aggregates whole-trip category totals and counts (not per-user shares)', () => {
    const r = computeTripStats(expenses, members, {});
    const food = r.categoryStats.find((c) => c.category === 'food')!;
    const transport = r.categoryStats.find((c) => c.category === 'transportation')!;
    expect(food.total).toBe(360); // 300 + 60
    expect(food.count).toBe(2);
    expect(transport.total).toBe(200);
    expect(r.totalAmount).toBe(560);
    expect(r.totalExpenses).toBe(3);
  });

  it('sorts categories by total desc and details by date desc', () => {
    const r = computeTripStats(expenses, members, {});
    expect(r.categoryStats.map((c) => c.category)).toEqual(['food', 'transportation']);
    const food = r.categoryStats[0];
    expect(food.details.map((d) => d.id)).toEqual(['e3', 'e1']); // 06-03 before 06-01
  });

  it('ranks members by amount paid and includes their share', () => {
    const r = computeTripStats(expenses, members, {});
    expect(r.memberSpends).toEqual([
      { userId: 'a', name: 'Alice', paid: 360, share: 260 },
      { userId: 'b', name: 'Bob', paid: 200, share: 200 },
      { userId: 'c', name: 'Charlie', paid: 0, share: 100 },
    ]);
  });

  it('repurposes detail.tripName to carry the payer name (group view)', () => {
    const r = computeTripStats(expenses, members, {});
    const food = r.categoryStats.find((c) => c.category === 'food')!;
    expect(food.details.find((d) => d.id === 'e1')!.tripName).toBe('Alice');
  });

  it('uses the trip date range for per-person-per-day average', () => {
    const r = computeTripStats(expenses, members, {
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });
    expect(r.dayCount).toBe(5); // inclusive
    expect(r.memberCount).toBe(3);
    expect(r.avgPerPersonPerDay).toBe(37); // round(560 / (3 * 5))
  });

  it('falls back to expense min/max dates when no trip range is set', () => {
    const r = computeTripStats(expenses, members, {});
    expect(r.dayCount).toBe(3); // 06-01 .. 06-03 inclusive
    expect(r.avgPerPersonPerDay).toBe(62); // round(560 / (3 * 3))
  });

  it('returns zeros for an empty trip but still lists members', () => {
    const r = computeTripStats([], members, {});
    expect(r.totalAmount).toBe(0);
    expect(r.totalExpenses).toBe(0);
    expect(r.categoryStats).toEqual([]);
    expect(r.dayCount).toBe(0);
    expect(r.avgPerPersonPerDay).toBe(0);
    expect(r.memberSpends).toEqual([
      { userId: 'a', name: 'Alice', paid: 0, share: 0 },
      { userId: 'b', name: 'Bob', paid: 0, share: 0 },
      { userId: 'c', name: 'Charlie', paid: 0, share: 0 },
    ]);
  });

  it('avoids divide-by-zero when there are no members', () => {
    const r = computeTripStats(expenses, [], { startDate: '2026-06-01', endDate: '2026-06-05' });
    expect(r.memberCount).toBe(0);
    expect(r.avgPerPersonPerDay).toBe(0);
  });

  it('returns an empty dailySpend when no itinerary days are provided', () => {
    const r = computeTripStats(expenses, members, {});
    expect(r.dailySpend).toEqual([]);
  });

  it('aggregates spend per itinerary day in day-number order, zeros included', () => {
    const days: TripStatsDay[] = [
      { id: 'd2', dayNumber: 2, title: 'Day Two' },
      { id: 'd1', dayNumber: 1, title: 'Day One' },
      { id: 'd3', dayNumber: 3, title: 'Day Three' },
    ];
    const linked: TripStatsExpense[] = [
      { ...expenses[0], itineraryDayIds: ['d1'] }, // 300 → day 1
      { ...expenses[1], itineraryDayIds: ['d1'] }, // 200 → day 1
      { ...expenses[2], itineraryDayIds: ['d2'] }, // 60  → day 2
    ];
    const r = computeTripStats(linked, members, {}, days);
    expect(r.dailySpend).toEqual([
      { dayId: 'd1', dayNumber: 1, title: 'Day One', total: 500, count: 2 },
      { dayId: 'd2', dayNumber: 2, title: 'Day Two', total: 60, count: 1 },
      { dayId: 'd3', dayNumber: 3, title: 'Day Three', total: 0, count: 0 },
    ]);
  });

  it('averages a multi-day expense across its linked days', () => {
    const days: TripStatsDay[] = [
      { id: 'd1', dayNumber: 1, title: 'Day One' },
      { id: 'd2', dayNumber: 2, title: 'Day Two' },
      { id: 'd3', dayNumber: 3, title: 'Day Three' },
    ];
    const linked: TripStatsExpense[] = [
      { ...expenses[0], itineraryDayIds: ['d1', 'd2', 'd3'] }, // 300 → 100/day
      { ...expenses[2], itineraryDayIds: ['d1'] }, // 60 → day 1
    ];
    const r = computeTripStats(linked, members, {}, days);
    expect(r.dailySpend).toEqual([
      { dayId: 'd1', dayNumber: 1, title: 'Day One', total: 160, count: 2 },
      { dayId: 'd2', dayNumber: 2, title: 'Day Two', total: 100, count: 1 },
      { dayId: 'd3', dayNumber: 3, title: 'Day Three', total: 100, count: 1 },
    ]);
  });

  it('puts unlinked expenses in a trailing null bucket', () => {
    const days: TripStatsDay[] = [{ id: 'd1', dayNumber: 1, title: 'Day One' }];
    const mixed: TripStatsExpense[] = [
      { ...expenses[0], itineraryDayIds: ['d1'] }, // 300 → day 1
      { ...expenses[1], itineraryDayIds: null }, // 200 → unlinked
      { ...expenses[2] }, // 60 → unlinked (undefined)
    ];
    const r = computeTripStats(mixed, members, {}, days);
    expect(r.dailySpend).toEqual([
      { dayId: 'd1', dayNumber: 1, title: 'Day One', total: 300, count: 1 },
      { dayId: null, dayNumber: null, title: '', total: 260, count: 2 },
    ]);
  });

  it('buckets uncategorized expenses under "other"', () => {
    const r = computeTripStats(
      [
        {
          id: 'x',
          category: null,
          date: '2026-06-01',
          description: '',
          amount: 50,
          payerId: 'a',
          payerName: 'Alice',
          splits: [{ userId: 'a', shareAmount: 50 }],
        },
      ],
      members,
      {}
    );
    expect(r.categoryStats[0].category).toBe('other');
  });
});
