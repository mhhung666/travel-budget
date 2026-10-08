'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { StatsDashboard, type StatsDashboardViewState } from '@/components/stats';
import { useStats, useStatsExpensePages } from '@/hooks/queries';
import type { StatsExpenseSort } from '@/types';
import { toLocalDateInputValue } from '@/lib/dateInput';
import {
  DEFAULT_STATS_VIEW_STATE,
  parseStatsViewState,
  writeStatsViewState,
} from '@/lib/statsViewState';

function defaultRange() {
  const today = new Date();
  return {
    startDate: toLocalDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toLocalDateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function StatsPage() {
  const tLedger = useTranslations('ledger');
  const [baseCurrency, setBaseCurrency] = useState('TWD');
  const [filters, setFilters] = useState(defaultRange);
  const [viewState, setViewState] = useState<StatsDashboardViewState>(DEFAULT_STATS_VIEW_STATE);
  const [expenseSort, setExpenseSort] = useState<StatsExpenseSort>('dateDesc');
  const [hydrated, setHydrated] = useState(false);
  const { startDate, endDate } = filters;
  const setStartDate = (value: string) =>
    setFilters((current) => ({ ...current, startDate: value }));
  const setEndDate = (value: string) => setFilters((current) => ({ ...current, endDate: value }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const unit = params.get('currency');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the external URL filter once.
    if (unit && /^[A-Z]{3}$/.test(unit)) setBaseCurrency(unit);
    // URL 是首次載入的外部狀態來源，hydration 完成前不回寫網址。
    setViewState(parseStatsViewState(params));
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
    params.set('currency', baseCurrency);
    if (!startDate && !endDate) {
      params.set('preset', 'all');
    } else {
      params.set('start', startDate);
      params.set('end', endDate);
    }
    writeStatsViewState(params, viewState);
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [startDate, endDate, viewState, hydrated, baseCurrency]);

  const {
    data: stats = null,
    isFetching: loading,
    isError,
    error: statsError,
    refetch,
  } = useStats(
    {
      baseCurrency,
      startDate,
      endDate,
      timelineInterval: viewState.interval,
      timelineFilters: {
        tripId: viewState.detailFilters.tripId,
        category: viewState.detailFilters.category,
        tag: viewState.detailFilters.tag,
        expenseId: viewState.detailFilters.expenseId,
      },
    },
    true
  );

  const error = isError
    ? statsError instanceof Error
      ? statsError.message
      : String(statsError)
    : '';
  const expensePages = useStatsExpensePages(
    {
      baseCurrency,
      startDate,
      endDate,
      sort: expenseSort,
      filters: viewState.detailFilters,
    },
    Boolean(stats?.totalExpenses)
  );
  const expenseDetails = expensePages.data?.pages.flatMap((page) => page.items) ?? [];

  const handleYearSelect = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  return (
    <>
      <label className="mx-auto block max-w-7xl px-4 pt-4">
        {tLedger('baseCurrency')}{' '}
        <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
          {(stats?.currencies ?? ['TWD']).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
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
        expenseDetails={expenseDetails}
        expenseSort={expenseSort}
        onExpenseSortChange={setExpenseSort}
        expenseDetailsLoading={expensePages.isPending}
        expenseDetailsFetchingNextPage={expensePages.isFetchingNextPage}
        expenseDetailsHasNextPage={expensePages.hasNextPage}
        expenseDetailsError={expensePages.isError}
        onLoadMoreExpenseDetails={() => {
          void expensePages.fetchNextPage();
        }}
        onRetryExpenseDetails={() => {
          void expensePages.refetch();
        }}
      />
    </>
  );
}
