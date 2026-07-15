'use client';

import { useQuery } from '@tanstack/react-query';
import { getMapPhotos, type MapPhoto } from '@/actions';
import { tripKeys } from './keys';

/**
 * 地圖相片圖層資料（所有旅程中有座標的相簿相片，ROADMAP #21 Phase 3——取代舊的收據衍生模式）。
 * 只在切到相片模式時才啟用（一次簽發全部相片的穩定 URL，較重）。
 * `year` 為 null 代表全部年份；不同年份各自快取。
 */
export function useMapPhotos(enabled: boolean, year: number | null) {
  return useQuery({
    queryKey: [...tripKeys.mapPhotos, year ?? 'all'],
    queryFn: async (): Promise<MapPhoto[]> => {
      const res = await getMapPhotos({ year });
      return res.success ? res.data : [];
    },
    enabled,
    staleTime: 60_000,
  });
}
