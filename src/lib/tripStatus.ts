/**
 * 行程「進行中」判斷（UI/UX 重設計 5.1 —— 行程列表置頂與「進行中 · Day N」標記）。
 * 以本地時區的日曆日比對：出發日當天即 Day 1，結束日當天仍算進行中。
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTripCalendarDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function calendarDayNumber(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

export type TripPhase = 'preTrip' | 'ongoing' | 'postTrip';

export interface TripPhaseInfo {
  phase: TripPhase;
  day: number | null;
  daysUntil: number | null;
}

export function getTripPhase(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date()
): TripPhaseInfo {
  const start = parseTripCalendarDate(startDate);
  const end = parseTripCalendarDate(endDate);
  const todayNumber = calendarDayNumber(now);
  const startNumber = start ? calendarDayNumber(start) : null;
  const endNumber = end ? calendarDayNumber(end) : null;

  if (startNumber !== null && todayNumber < startNumber) {
    return { phase: 'preTrip', day: null, daysUntil: startNumber - todayNumber };
  }

  if (endNumber !== null && todayNumber > endNumber) {
    return { phase: 'postTrip', day: null, daysUntil: null };
  }

  if (startNumber !== null && todayNumber >= startNumber) {
    return {
      phase: 'ongoing',
      day: todayNumber - startNumber + 1,
      daysUntil: null,
    };
  }

  return { phase: 'preTrip', day: null, daysUntil: null };
}

export function ongoingDayNumber(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date()
): number | null {
  if (!startDate || !endDate) return null;
  const phase = getTripPhase(startDate, endDate, now);
  return phase.phase === 'ongoing' ? phase.day : null;
}

export type TripCardStatus =
  | { kind: 'upcoming'; daysUntil: number }
  | { kind: 'ongoing'; day: number }
  | { kind: 'pendingSettlement' }
  | { kind: 'settled' }
  | { kind: 'none' };

/**
 * 旅行列表卡片的狀態標記（UX 改善 #6）。封存旅行不標；結束後依「我的」結算餘額
 * 區分待結算／已結清，沒有任何花費的旅行不標「已結清」以免誤導。
 */
export function getTripCardStatus(
  trip: {
    start_date: string | null;
    end_date: string | null;
    archived_at: string | null;
    my_spent: number;
    my_balance: number;
  },
  now: Date = new Date()
): TripCardStatus {
  if (trip.archived_at != null) return { kind: 'none' };
  const phase = getTripPhase(trip.start_date, trip.end_date, now);
  if (phase.phase === 'preTrip') {
    return phase.daysUntil !== null
      ? { kind: 'upcoming', daysUntil: phase.daysUntil }
      : { kind: 'none' };
  }
  // 只有開始日、沒有結束日時 getTripPhase 會一直判為進行中；列表沿用 ongoingDayNumber
  // 需要兩端日期的既有規則，避免久遠旅行永遠顯示「旅行中」。
  if (phase.phase === 'ongoing') {
    return trip.end_date ? { kind: 'ongoing', day: phase.day ?? 1 } : { kind: 'none' };
  }
  if (Math.abs(trip.my_balance) >= 0.01) return { kind: 'pendingSettlement' };
  return trip.my_spent > 0 ? { kind: 'settled' } : { kind: 'none' };
}
