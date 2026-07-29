import type { TimeInterval } from '@/types';

export type StatsDimension = 'category' | 'trip' | 'tag';
export type StatsMetric = 'amount' | 'count';

export interface StatsDetailFilters {
  tripId?: string;
  category?: string;
  tag?: string;
  periodStart?: string;
  periodEnd?: string;
  expenseId?: string;
}

export interface StatsDashboardViewState {
  dimension: StatsDimension;
  metric: StatsMetric;
  interval: TimeInterval;
  detailFilters: StatsDetailFilters;
}

export const DEFAULT_STATS_VIEW_STATE: StatsDashboardViewState = {
  dimension: 'category',
  metric: 'amount',
  interval: 'day',
  detailFilters: {},
};

export function parseStatsViewState(params: URLSearchParams): StatsDashboardViewState {
  const rawDimension = params.get('dimension');
  const dimension: StatsDimension =
    rawDimension === 'trip' || rawDimension === 'tag' || rawDimension === 'category'
      ? rawDimension
      : 'category';
  const rawInterval = params.get('interval');
  const legacyValue = params.get('value') || undefined;

  return {
    dimension,
    metric: params.get('metric') === 'count' ? 'count' : 'amount',
    interval:
      rawInterval === 'week' || rawInterval === 'month' || rawInterval === 'day'
        ? rawInterval
        : 'day',
    detailFilters: {
      tripId: params.get('trip') || (dimension === 'trip' ? legacyValue : undefined),
      category: params.get('category') || (dimension === 'category' ? legacyValue : undefined),
      tag: params.get('tag') || (dimension === 'tag' ? legacyValue : undefined),
      periodStart: params.get('periodStart') || undefined,
      periodEnd: params.get('periodEnd') || undefined,
      expenseId: params.get('expense') || undefined,
    },
  };
}

export function writeStatsViewState(params: URLSearchParams, viewState: StatsDashboardViewState) {
  if (viewState.dimension !== 'category') params.set('dimension', viewState.dimension);
  if (viewState.detailFilters.tripId) params.set('trip', viewState.detailFilters.tripId);
  if (viewState.detailFilters.category) params.set('category', viewState.detailFilters.category);
  if (viewState.detailFilters.tag) params.set('tag', viewState.detailFilters.tag);
  if (viewState.detailFilters.expenseId) params.set('expense', viewState.detailFilters.expenseId);
  if (viewState.metric !== 'amount') params.set('metric', viewState.metric);
  params.set('interval', viewState.interval);
  if (viewState.detailFilters.periodStart && viewState.detailFilters.periodEnd) {
    params.set('periodStart', viewState.detailFilters.periodStart);
    params.set('periodEnd', viewState.detailFilters.periodEnd);
  }
}
