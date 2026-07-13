/**
 * 行程活動 →「旅行成就」一鍵帶入的預填啟發式（ROADMAP #19 P2）。
 * 純函式、無 I/O；帶入只是**預填表單**，猜錯使用者在對話框裡改掉即可，
 * 故啟發式取「常見寫法命中」而非完備解析。
 */

import { HOTEL_BRANDS } from '@/constants/hotelBrands';

/** 行程活動類型 → 帶入的成就種類；非 transport/accommodation 回 null（不提供帶入）。 */
export function activityImportKind(type: string): 'flight' | 'stay' | null {
  if (type === 'transport') return 'flight';
  if (type === 'accommodation') return 'stay';
  return null;
}

/**
 * 從活動標題/備註猜航班號：兩碼 IATA 前綴（至少含一個字母）＋ 1–4 位數字，
 * 容忍空格與連字號（"BR182" / "br-182" / "BR 182"）。猜不到回 null。
 */
export function parseFlightNo(text: string): { airline: string; flightNo: string } | null {
  const m = text
    .toUpperCase()
    .match(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]|[0-9][A-Z])\s?-?\s?(\d{1,4})(?![0-9])/);
  if (!m) return null;
  return { airline: m[1], flightNo: `${m[1]}${m[2]}` };
}

/**
 * 從活動標題比對飯店品牌（目錄 nameZh / name 子字串，不分大小寫）。
 * 多個命中取**名稱最長**者（"Hilton Garden Inn" 不該被 "Hilton" 搶走）。
 */
export function matchHotelBrand(title: string): string | null {
  const lower = title.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const b of HOTEL_BRANDS) {
    if (b.nameZh && title.includes(b.nameZh) && (!best || b.nameZh.length > best.len)) {
      best = { id: b.id, len: b.nameZh.length };
    }
    const en = b.name.toLowerCase();
    if (lower.includes(en) && (!best || en.length > best.len)) {
      best = { id: b.id, len: en.length };
    }
  }
  return best?.id ?? null;
}

/**
 * 由旅程出發日推算第 N 天的日期（YYYY-MM-DD）；旅程未設日期回 null。
 * 用 UTC 計算避免時區跨日。
 */
export function dayDateFromTrip(
  startDate: string | null | undefined,
  dayNumber: number
): string | null {
  if (!startDate) return null;
  const ymd = startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + dayNumber - 1);
  return d.toISOString().slice(0, 10);
}
