import type { TripWithMembers } from '@/types';
import { ongoingDayNumber } from './tripStatus';

export type QuickAddDecision =
  | { kind: 'none'; trips: [] }
  | { kind: 'direct'; trip: TripWithMembers; trips: TripWithMembers[] }
  | { kind: 'pick'; trips: TripWithMembers[] };

type RankedTrip = {
  trip: TripWithMembers;
  group: number;
  time: number;
};

const dateTime = (value: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

/**
 * 全域快速記帳的單一旅行選擇規則（網頁入口與 PWA shortcut 共用）：
 * 進行中 → 即將出發 → 最近結束 → 無日期；封存旅行不列入。
 * 上次使用只在同一情境群組內置頂，避免過期旅行蓋過正在旅行中的項目。
 */
export function rankQuickAddTrips(
  trips: TripWithMembers[],
  now: Date = new Date(),
  preferredTripId?: string | null
): TripWithMembers[] {
  const nowTime = now.getTime();
  const ranked: RankedTrip[] = trips
    .filter((trip) => trip.archived_at == null)
    .map((trip) => {
      const start = dateTime(trip.start_date);
      const end = dateTime(trip.end_date);
      const created = dateTime(trip.created_at) ?? 0;

      if (ongoingDayNumber(trip.start_date, trip.end_date, now) !== null) {
        return { trip, group: 0, time: start ?? created };
      }
      if (start !== null && start > nowTime) {
        return { trip, group: 1, time: start };
      }
      if (end !== null && end < nowTime) {
        return { trip, group: 2, time: end };
      }
      return { trip, group: 3, time: created };
    });

  ranked.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;

    const aPreferred = a.trip.id === preferredTripId || a.trip.hash_code === preferredTripId;
    const bPreferred = b.trip.id === preferredTripId || b.trip.hash_code === preferredTripId;
    if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;

    // 即將出發的旅行由近到遠；其他群組由新到舊。
    return a.group === 1 ? a.time - b.time : b.time - a.time;
  });

  return ranked.map(({ trip }) => trip);
}

/**
 * 只有一趟進行中旅行時直接開表單；沒有進行中旅行但僅一趟可用旅行時亦直接開啟。
 * 其餘情況交給 picker，避免多趟旅行時把支出記錯。
 */
export function decideQuickAddTrip(
  trips: TripWithMembers[],
  now: Date = new Date(),
  preferredTripId?: string | null
): QuickAddDecision {
  const ranked = rankQuickAddTrips(trips, now, preferredTripId);
  if (ranked.length === 0) return { kind: 'none', trips: [] };

  const ongoing = ranked.filter(
    (trip) => ongoingDayNumber(trip.start_date, trip.end_date, now) !== null
  );
  if (ongoing.length === 1) {
    return { kind: 'direct', trip: ongoing[0], trips: ranked };
  }
  if (ranked.length === 1) {
    return { kind: 'direct', trip: ranked[0], trips: ranked };
  }
  return { kind: 'pick', trips: ranked };
}
