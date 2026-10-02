'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getStatsExpensePage } from '@/actions';
import type { StatsExpenseFilters, StatsExpensePage, StatsExpenseSort } from '@/types';

interface StatsExpensePageFilters {
  startDate?: string;
  endDate?: string;
  filters?: StatsExpenseFilters;
  sort: StatsExpenseSort;
}

export function useStatsExpensePages(options: StatsExpensePageFilters, enabled = true) {
  const { startDate, endDate, filters = {}, sort } = options;
  const { tripId, category, tag, expenseId, periodStart, periodEnd } = filters;

  return useInfiniteQuery({
    queryKey: [
      'stats',
      'expense-pages',
      startDate ?? null,
      endDate ?? null,
      sort,
      tripId ?? null,
      category ?? null,
      tag ?? null,
      expenseId ?? null,
      periodStart ?? null,
      periodEnd ?? null,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<StatsExpensePage> => {
      const result = await getStatsExpensePage({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sort,
        cursor: pageParam,
        filters: { tripId, category, tag, expenseId, periodStart, periodEnd },
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}
