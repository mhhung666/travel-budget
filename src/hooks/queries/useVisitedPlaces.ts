'use client';

import { useQuery } from '@tanstack/react-query';
import { getVisitedPlaces, type VisitedPlace } from '@/actions';
import { tripKeys } from './keys';

/**
 * 旅行地圖熱點資料（所有旅程的行程日地點，依座標彙整為權重）。
 * 只在需要時（切到熱點模式）啟用，避免每次進地圖都查。
 */
export function useVisitedPlaces(enabled: boolean) {
  return useQuery({
    queryKey: tripKeys.visitedPlaces,
    queryFn: async (): Promise<VisitedPlace[]> => {
      const res = await getVisitedPlaces();
      return res.success ? res.data : [];
    },
    enabled,
    staleTime: 60_000,
  });
}
