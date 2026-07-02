/**
 * 行程「進行中」判斷（UI/UX 重設計 5.1 —— 行程列表置頂與「進行中 · Day N」標記）。
 * 以本地時區的日曆日比對：出發日當天即 Day 1，結束日當天仍算進行中。
 */
export function ongoingDayNumber(
  startDate: string | null,
  endDate: string | null,
  now: Date = new Date()
): number | null {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endExclusive =
    new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() + DAY_MS;

  const t = now.getTime();
  if (t < startMidnight || t >= endExclusive) return null;

  return Math.floor((t - startMidnight) / DAY_MS) + 1;
}
