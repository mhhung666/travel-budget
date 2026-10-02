'use client';

import { useQuery } from '@tanstack/react-query';
import { getActivityLog } from '@/actions';
import type { ActivityLogItem } from '@/types';
import { tripKeys } from './keys';
import { unwrapActionResult } from '@/lib/actionQuery';

/**
 * 旅程動態牆（活動紀錄，新到舊）。trip-scoped，掛在 `tripKeys.activity` 下，
 * 故支出 / 還款 mutation invalidate `tripKeys.all(tripId)` 時會一併刷新。
 * 失敗交給 Query error 狀態，不當成空資料。
 */
export function useActivityLog(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripKeys.activity(tripId),
    queryFn: async (): Promise<ActivityLogItem[]> => {
      const res = await getActivityLog(tripId);
      return unwrapActionResult(res);
    },
    enabled: enabled && !!tripId,
  });
}
