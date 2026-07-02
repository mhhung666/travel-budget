'use client';

import { useState } from 'react';
import { StatsDashboard } from '@/components/stats';
import { useStats } from '@/hooks/queries';

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function StatsPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const {
    data: stats = null,
    isFetching: loading,
    isError,
    error: statsError,
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
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={setStartDate}
      onEndDateChange={setEndDate}
      onYearSelect={handleYearSelect}
    />
  );
}
