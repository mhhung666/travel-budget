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
