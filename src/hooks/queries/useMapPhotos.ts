'use client';

import { useQuery } from '@tanstack/react-query';
import { getMapPhotos, type MapPhoto } from '@/actions';
import { tripKeys } from './keys';

/**
 * 地圖相片釘點資料（所有旅程中含圖片附件、且關聯到含座標行程日的支出收據）。
 * 只在切到相片模式時才啟用（含 $lookup 關聯行程日，較重）。
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
