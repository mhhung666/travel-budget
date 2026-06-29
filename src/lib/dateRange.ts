/**
 * 旅程起訖是否與查詢區間重疊。
 *
 * 同時供伺服器端國家統計（[stats.actions](../actions/stats.actions.ts)）與旅行地圖的
 * 日期篩選使用，確保兩處「哪些旅程落在區間內」的判斷一致。
 *
 * 規則：
 * - 區間兩端皆空 → 不過濾，一律視為符合（true）。
 * - 旅程缺起訖（無法定位）→ 有過濾時排除（false）。
 * - 否則以旅程 [start, end] 與區間 [rangeStart, rangeEnd] 是否重疊判斷。
 *
 * 邊界（如 rangeEnd 要不要含當日 23:59）由呼叫端在建構 Date 時決定，本函式只做比較。
 */
export function tripOverlapsRange(
  tripStart: Date | null | undefined,
  tripEnd: Date | null | undefined,
  rangeStart: Date | null,
  rangeEnd: Date | null
): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const start = tripStart ?? tripEnd ?? null;
  const end = tripEnd ?? tripStart ?? null;
  if (!start || !end) return false;
  if (rangeEnd && start > rangeEnd) return false;
  if (rangeStart && end < rangeStart) return false;
  return true;
}

/**
 * 一段起訖日所涵蓋的整年清單（含跨年，升冪）。任一端缺值時以另一端補；兩端皆空回空陣列。
 *
 * 供「只露年份、不露完整日期」的去識別化場景共用：公開地圖路由、公開年度回顧路由，
 * 以及年度回顧的可選年份清單（[lib/yearInReview.ts]）。
 */
export function yearsSpanned(start?: Date | string | null, end?: Date | string | null): number[] {
  if (!start && !end) return [];
  const s = new Date((start ?? end) as Date | string).getFullYear();
  const e = new Date((end ?? start) as Date | string).getFullYear();
  if (Number.isNaN(s) || Number.isNaN(e)) return [];
  const out: number[] = [];
  for (let y = Math.min(s, e); y <= Math.max(s, e); y++) out.push(y);
  return out;
}
