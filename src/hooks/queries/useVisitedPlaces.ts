'use client';
import { unwrapActionResult } from '@/lib/actionQuery';

import { useQuery } from '@tanstack/react-query';
import { getVisitedPlaces, type VisitedPlace } from '@/actions';
import { localDateKey } from '@/lib/tripStatus';
import { tripKeys } from './keys';

/**
 * 旅行地圖熱點資料（所有旅程的行程日地點，依座標彙整為權重）。
 * `year` 為 null 代表全部年份；不同年份各自快取。
 * `today` 是瀏覽器本地日曆日，伺服器用它判斷計畫中；換日後重新渲染時 key 不同會重抓。
 * 此 hook 不排程跨日更新，頁面持續閒置跨午夜時不保證立即重抓。
 */
export function useVisitedPlaces(
  enabled: boolean,
  year: number | null,
  today: string = localDateKey()
) {
  return useQuery({
    queryKey: [...tripKeys.visitedPlaces, year ?? 'all', today],
    queryFn: async (): Promise<VisitedPlace[]> => {
      const res = await getVisitedPlaces({ year, today });
      return unwrapActionResult(res);
    },
    enabled,
    staleTime: 60_000,
  });
}
