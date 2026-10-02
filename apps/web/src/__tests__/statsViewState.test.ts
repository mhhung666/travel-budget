import { describe, expect, it } from 'vitest';
import { parseStatsViewState, writeStatsViewState } from '@/lib/statsViewState';

describe('personal stats URL state', () => {
  it('restores composite filters and writes them back deterministically', () => {
    const state = parseStatsViewState(
      new URLSearchParams(
        'dimension=tag&trip=trip-1&category=food&tag=fancy&periodStart=2026-07-12&periodEnd=2026-07-12&expense=expense-1&metric=count&interval=week'
      )
    );

    expect(state).toEqual({
      dimension: 'tag',
      metric: 'count',
      interval: 'week',
      detailFilters: {
        tripId: 'trip-1',
        category: 'food',
        tag: 'fancy',
        periodStart: '2026-07-12',
        periodEnd: '2026-07-12',
        expenseId: 'expense-1',
      },
    });

    const params = new URLSearchParams();
    writeStatsViewState(params, state);
    expect(params.toString()).toBe(
      'dimension=tag&trip=trip-1&category=food&tag=fancy&expense=expense-1&metric=count&interval=week&periodStart=2026-07-12&periodEnd=2026-07-12'
    );
  });

  it('converts legacy dimension and value links into the matching filter', () => {
    expect(parseStatsViewState(new URLSearchParams('dimension=trip&value=trip-1'))).toEqual({
      dimension: 'trip',
      metric: 'amount',
      interval: 'day',
      detailFilters: {
        tripId: 'trip-1',
        category: undefined,
        tag: undefined,
        periodStart: undefined,
        periodEnd: undefined,
        expenseId: undefined,
      },
    });
  });
});
