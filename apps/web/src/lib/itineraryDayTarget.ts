/**
 * 「依日期新增行程日」的共用規則。
 *
 * 資料來源仍是 `ItineraryDay.dayNumber`（相對旅程開始日的第 N 天），沒有獨立 date 欄位；
 * 這裡集中日曆日 ↔ dayNumber 的換算、範圍判斷與預設目標，讓表單預覽與交易內的權威計算
 * 使用同一套規則（前端預覽不可信，server 一律重算）。
 *
 * 一律以 UTC 午夜比較整日，避免裝置時區把本地午夜轉 ISO 後截斷成前一天。
 */

/** 允許的最大 dayNumber；沒有開始日時用來擋住離譜輸入。 */
export const MAX_ITINERARY_DAY_NUMBER = 3650;

/** 快捷日期按鈕全部展開的旅程長度上限；更長的旅程只留日期欄位與捷徑。 */
export const MAX_QUICK_PICK_DAYS = 14;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 嚴格 YYYY-MM-DD，且必須是真實存在的日曆日（擋掉 2026-02-30、2026-13-01）。 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 把 Date／ISO 字串／date-only 正規化成 YYYY-MM-DD；無效或空值回 null。 */
export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const head = value.slice(0, 10);
    return isCalendarDate(head) ? head : null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function utcMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** 兩個日曆日之間的整日差（後者減前者）。 */
export function dayDiff(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** Day N＝出發後第 N 天；開始日當天為 Day 1。 */
export function dayNumberForDate(startDate: string, date: string): number {
  return dayDiff(startDate, date) + 1;
}

/** Day N 對應的日曆日；dayNumber 必須是正整數。 */
export function dateForDayNumber(startDate: string, dayNumber: number): string {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayNumber - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * 旅程範圍內的所有日曆日（含首尾）。只有開始日時回空陣列——上限未知，
 * 由呼叫端改走「不設虛構上限」的流程。
 */
export function tripDateList(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string[] {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let cursor = start; cursor <= end; cursor = dateForDayNumber(cursor, 2)) out.push(cursor);
  return out;
}

/** 選定日期是否落在旅程範圍內（只有開始日時，開始日當天或之後皆可）。 */
export function isDateWithinTrip(
  date: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): boolean {
  const start = toDateOnly(startDate);
  if (!start || date < start) return false;
  const end = toDateOnly(endDate);
  return !end || date <= end;
}

/**
 * 預設選取：旅程範圍內最早尚未建立的一天。全部建立（或無法判斷）時回 null，
 * 由呼叫端改顯示「皆已建立」流程。
 */
export function firstUnusedDate(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  usedDayNumbers: Iterable<number>
): string | null {
  const start = toDateOnly(startDate);
  if (!start) return null;
  const used = new Set(usedDayNumbers);
  const end = toDateOnly(endDate);
  // 沒有結束日時仍要給一個可用預設；沿著已用天數往後找第一個空缺即可。
  const limit = end ? dayNumberForDate(start, end) : Math.max(0, ...used) + 1;
  for (let n = 1; n <= limit; n++) {
    if (!used.has(n)) return dateForDayNumber(start, n);
  }
  return null;
}

/** 沒有開始日時的預設天數：最小尚未使用的正整數。 */
export function firstUnusedDayNumber(usedDayNumbers: Iterable<number>): number {
  const used = new Set(usedDayNumbers);
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
