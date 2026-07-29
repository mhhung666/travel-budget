'use client';

import { useEffect, useRef, useState } from 'react';
import { StatsDashboard } from '@/components/stats';
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
  const [filters, setFilters] = useState(() => ({ ...defaultRange(), compare: true }));
  const skipFirstUrlWrite = useRef(true);
  const { startDate, endDate, compare } = filters;
  const setStartDate = (value: string) =>
    setFilters((current) => ({ ...current, startDate: value }));
  const setEndDate = (value: string) => setFilters((current) => ({ ...current, endDate: value }));
  const setCompare = (value: boolean) => setFilters((current) => ({ ...current, compare: value }));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preset') === 'all') {
      // URL 是外部狀態來源；首次 hydration 後將它還原到 dashboard state。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilters({ startDate: '', endDate: '', compare: false });
      return;
    }
    const queryStart = params.get('start');
    const queryEnd = params.get('end');
    if (queryStart && queryEnd) {
      setFilters({
        startDate: queryStart,
        endDate: queryEnd,
        compare: params.get('compare') !== '0',
      });
    }
  }, []);

  useEffect(() => {
    if (skipFirstUrlWrite.current) {
      skipFirstUrlWrite.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (!startDate && !endDate) {
      params.set('preset', 'all');
    } else {
      params.set('start', startDate);
      params.set('end', endDate);
      params.set('compare', compare ? '1' : '0');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }, [startDate, endDate, compare]);

  const {
    data: stats = null,
    isFetching: loading,
    isError,
    error: statsError,
  } = useStats({ startDate, endDate, compare }, true);

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
      startDate={startDate}
      endDate={endDate}
      compare={compare}
      onCompareChange={setCompare}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      onYearSelect={handleYearSelect}
      onClearDates={() => {
        setStartDate('');
        setEndDate('');
        setCompare(false);
      }}
    />
  );
}
