import { redirect } from 'next/navigation';
import { getTrips } from '@/actions';
import { ROUTES } from '@/constants/routes';
import { ongoingDayNumber } from '@/lib/tripStatus';

/**
 * PWA「記一筆」捷徑（manifest shortcut，UI/UX 重設計 §6）：
 * 導向最合適的行程並直接開啟新增支出（TripSpaceShell 讀 `?add=expense`）。
 * 挑選順序：進行中的行程 → 最近的未封存行程 → 沒有行程時回列表。
 * 未登入由 proxy.ts（PROTECTED_ROUTES 含 /quick-add）導去 /login。
 */
export default async function QuickAddPage() {
  const result = await getTrips();
  const trips = result.success ? result.data : [];

  const active = trips.filter((t) => t.archived_at == null);
  const target =
    active.find((t) => ongoingDayNumber(t.start_date, t.end_date) !== null) ?? active[0];

  if (!target) {
    redirect(ROUTES.TRIPS);
  }
  redirect(`${ROUTES.TRIP_DETAIL(target.hash_code)}?add=expense`);
}
