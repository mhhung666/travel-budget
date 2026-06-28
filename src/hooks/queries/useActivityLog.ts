'use client';

import { useQuery } from '@tanstack/react-query';
import { getActivityLog } from '@/actions';
import type { ActivityLogItem } from '@/types';
import { tripKeys } from './keys';

/**
 * 旅程動態牆（活動紀錄，新到舊）。trip-scoped，掛在 `tripKeys.activity` 下，
 * 故支出 / 還款 mutation invalidate `tripKeys.all(tripId)` 時會一併刷新。
 * 失敗回空陣列（動態牆只是空的，不擋頁面）。
 */
export function useActivityLog(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripKeys.activity(tripId),
    queryFn: async (): Promise<ActivityLogItem[]> => {
      const res = await getActivityLog(tripId);
      return res.success ? res.data : [];
    },
    enabled: enabled && !!tripId,
  });
}
