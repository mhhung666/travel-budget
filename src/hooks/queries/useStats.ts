'use client';

import { useQuery } from '@tanstack/react-query';
import { getStats } from '@/actions';
import type { StatsData } from '@/types';

interface StatsFilters {
  startDate?: string;
  endDate?: string;
  compare?: boolean;
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
  const { startDate, endDate, compare = false } = filters;
  return useQuery({
    queryKey: ['stats', startDate ?? null, endDate ?? null, compare],
    queryFn: async (): Promise<StatsData> => {
      const result = await getStats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        compare,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled,
  });
}
