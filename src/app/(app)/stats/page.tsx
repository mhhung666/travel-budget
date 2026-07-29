'use client';

import { useEffect, useState } from 'react';
import { StatsDashboard, type StatsDashboardViewState } from '@/components/stats';
import type { TimeInterval } from '@/types';
import { useStats } from '@/hooks/queries';
import { toLocalDateInputValue } from '@/lib/dateInput';

function defaultRange() {
  const today = new Date();
  return {
    startDate: toLocalDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toLocalDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function StatsPage() {
  const [filters, setFilters] = useState(defaultRange);
  const [viewState, setViewState] = useState<StatsDashboardViewState>({
    dimension: 'category',
    metric: 'amount',
    interval: 'day',
    selectedPeriod: null,
  });
  const [hydrated, setHydrated] = useState(false);
  const { startDate, endDate } = filters;
  const setStartDate = (value: string) =>
    setFilters((current) => ({ ...current, startDate: value }));
  const setEndDate = (value: string) => setFilters((current) => ({ ...current, endDate: value }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dimension = params.get('dimension');
    const metric = params.get('metric');
    const interval = params.get('interval');
    const periodStart = params.get('periodStart');
    const periodEnd = params.get('periodEnd');
    // URL 是首次載入的外部狀態來源，hydration 完成前不回寫網址。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewState({
      dimension:
        dimension === 'trip' || dimension === 'tag' || dimension === 'category'
          ? dimension
          : 'category',
      dimensionValue: params.get('value') || undefined,
      metric: metric === 'count' ? 'count' : 'amount',
      interval:
        interval === 'week' || interval === 'month' || interval === 'day'
          ? (interval as TimeInterval)
          : 'day',
      selectedPeriod:
        periodStart && periodEnd ? { startDate: periodStart, endDate: periodEnd } : null,
    });
    if (params.get('preset') === 'all') {
      // URL 是外部狀態來源；首次 hydration 後將它還原到 dashboard state。
      setFilters({ startDate: '', endDate: '' });
    } else {
      const queryStart = params.get('start');
      const queryEnd = params.get('end');
      if (queryStart && queryEnd) {
        setFilters({ startDate: queryStart, endDate: queryEnd });
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (!startDate && !endDate) {
      params.set('preset', 'all');
    } else {
      params.set('start', startDate);
      params.set('end', endDate);
    }
    if (viewState.dimension !== 'category') params.set('dimension', viewState.dimension);
    if (viewState.dimensionValue) params.set('value', viewState.dimensionValue);
    if (viewState.metric !== 'amount') params.set('metric', viewState.metric);
    params.set('interval', viewState.interval);
    if (viewState.selectedPeriod) {
      params.set('periodStart', viewState.selectedPeriod.startDate);
      params.set('periodEnd', viewState.selectedPeriod.endDate);
    }
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [startDate, endDate, viewState, hydrated]);

  const {
    data: stats = null,
    isFetching: loading,
    isError,
    error: statsError,
    refetch,
  } = useStats({ startDate, endDate }, true);

  const error = isError
    ? statsError instanceof Error
      ? statsError.message
      : String(statsError)
    : '';

  const handleYearSelect = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  return (
    <StatsDashboard
      stats={stats}
      loading={loading}
      error={error}
      onRetry={() => {
        void refetch();
      }}
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      onYearSelect={handleYearSelect}
      onClearDates={() => {
        setStartDate('');
        setEndDate('');
      }}
      viewState={viewState}
      onViewStateChange={setViewState}
    />
  );
}
