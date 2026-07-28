'use client';

import { useQuery } from '@tanstack/react-query';
import { getVisitedPlaces, type VisitedPlace } from '@/actions';
import { tripKeys } from './keys';

/**
 * 旅行地圖熱點資料（所有旅程的行程日地點，依座標彙整為權重）。
 * `year` 為 null 代表全部年份；不同年份各自快取。
 */
export function useVisitedPlaces(enabled: boolean, year: number | null) {
  return useQuery({
    queryKey: [...tripKeys.visitedPlaces, year ?? 'all'],
    queryFn: async (): Promise<VisitedPlace[]> => {
      const res = await getVisitedPlaces({ year });
      return res.success ? res.data : [];
    },
    enabled,
    staleTime: 60_000,
  });
}
