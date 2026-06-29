'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getYearInReview, type YearInReviewResult } from '@/actions';

/**
 * 年度旅行回顧（Travel Wrapped）資料。個人跨旅程視角，不在 tripKeys 樹下；
 * 年份是 key 的一部分，各年份各自快取（並由既有 IndexedDB 持久化層離線保留）。
 *
 * `year` 為 null 時請求「最近一個有資料的年份」（由 action 決定）；回傳含 availableYears
 * 供前端年份切換。在使用者確定前傳 `enabled: false`，避免登入前必定 UNAUTHORIZED 的請求。
 */
export function useYearInReview(year: number | null, enabled = true) {
  return useQuery({
    queryKey: ['yearInReview', year ?? 'latest'],
    queryFn: async (): Promise<YearInReviewResult> => {
      const res = await getYearInReview(year);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled,
    staleTime: 60_000,
    // 切換年份時保留上一年的資料，避免年份列被整頁 spinner 取代。
    placeholderData: keepPreviousData,
  });
}
