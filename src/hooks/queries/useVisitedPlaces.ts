'use client';

import { useQuery } from '@tanstack/react-query';
import { getVisitedPlaces, type VisitedPlace, type HeatWeightBy } from '@/actions';
import { tripKeys } from './keys';

/**
 * 旅行地圖熱點資料（所有旅程的行程日地點，依座標彙整為權重）。
 * 只在需要時（切到熱點模式）啟用，避免每次進地圖都查。
 * `year` 為 null 代表全部年份；不同年份各自快取。
 * `weightBy` 為 'visits'（造訪次數，預設）或 'spend'（花費總額）；兩者各自快取。
 */
export function useVisitedPlaces(
  enabled: boolean,
  year: number | null,
  weightBy: HeatWeightBy = 'visits'
) {
  return useQuery({
    queryKey: [...tripKeys.visitedPlaces, year ?? 'all', weightBy],
    queryFn: async (): Promise<VisitedPlace[]> => {
      const res = await getVisitedPlaces({ year, weightBy });
      return res.success ? res.data : [];
    },
    enabled,
    staleTime: 60_000,
  });
}
