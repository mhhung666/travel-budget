import { LoadingState } from '@/components/common';

/** 路由切換時的統一載入態（資料層的 skeleton 由各頁的 query loading 呈現）。 */
export default function Loading() {
  return <LoadingState />;
}
