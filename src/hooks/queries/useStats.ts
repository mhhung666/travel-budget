'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getStats } from '@/actions';
import type { StatsData, TimeInterval } from '@/types';

interface StatsFilters {
  startDate?: string;
  endDate?: string;
  timelineInterval?: TimeInterval;
  timelineFilters?: {
    tripId?: string;
    category?: string;
    tag?: string;
    expenseId?: string;
  };
}

/**
 * Authenticated, cross-trip statistics for the current user, optionally
 * filtered by date range. Not trip-scoped, so it lives outside tripKeys; the
 * date range is part of the key so each range is cached independently.
 *
 * Pass `enabled: false` until the user is known to avoid a guaranteed
 * UNAUTHORIZED fetch before auth resolves.
 */
export function useStats(filters: StatsFilters, enabled = true) {
  const { startDate, endDate, timelineInterval = 'day', timelineFilters = {} } = filters;
  const { tripId, category, tag, expenseId } = timelineFilters;
  return useQuery({
    queryKey: [
      'stats',
      startDate ?? null,
      endDate ?? null,
      'timeline',
      timelineInterval,
      tripId ?? null,
      category ?? null,
      tag ?? null,
      expenseId ?? null,
    ],
    queryFn: async (): Promise<StatsData> => {
      const result = await getStats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        timelineInterval,
        timelineFilters: { tripId, category, tag, expenseId },
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}
