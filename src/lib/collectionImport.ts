/**
 * 行程活動 →「旅行成就」一鍵帶入的預填啟發式（ROADMAP #19 P2）。
 * 純函式、無 I/O；帶入只是**預填表單**，猜錯使用者在對話框裡改掉即可，
 * 故啟發式取「常見寫法命中」而非完備解析。
 */

import { HOTEL_BRANDS } from '@/constants/hotelBrands';

/** 行程活動類型 → 帶入的成就種類；只有明確的航班與住宿提供帶入。 */
export function activityImportKind(type: string): 'flight' | 'stay' | null {
  if (type === 'flight') return 'flight';
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
 * 從活動標題/備註猜出發/抵達機場：一組大寫 IATA 三碼、中間夾方向記號
 * （箭頭 / 連字號 / 斜線 / ✈ / "to" / 往至到飛去）。例："TPE→NRT"、"TPE - NRT"、"TPE to NRT"。
 * 機場代碼慣以大寫書寫，故**只認大寫**以免把 "the-end" 這類小寫字誤判成代碼。
 * 不驗證目錄（純函式）；猜錯或不在目錄由對話框的機場選擇器呈現/改掉。猜不到回 null。
 */
export function parseAirports(text: string): { from: string; to: string } | null {
  const m = text.match(
    /\b([A-Z]{3})\s*(?:→|➡|⇒|⟶|►|»|-|–|—|~|\/|✈️?|to|TO|往|至|到|飛|去)\s*([A-Z]{3})\b/
  );
  if (!m) return null;
  return { from: m[1], to: m[2] };
}

/**
 * 從活動標題比對飯店品牌（目錄 nameZh / name 子字串，不分大小寫）。
 * 多個命中取**名稱最長**者（"Hilton Garden Inn" 不該被 "Hilton" 搶走）。
 */
export function matchHotelBrand(title: string): string | null {
  const lower = title.toLowerCase();
  let bestId: string | null = null;
  let bestLen = 0;
  for (const b of HOTEL_BRANDS) {
    // 每個品牌的比對詞：繁中名、英文名，加旗艦品牌的裸集團關鍵字別名
    // （"Bangkok Marriott Marquis" 這種）。別名比全名短，具體子品牌命中時靠最長命中勝出。
    const needles = [b.nameZh, b.name, ...(b.aliases ?? [])];
    for (const needle of needles) {
      if (!needle) continue;
      const n = needle.toLowerCase();
      if (lower.includes(n) && n.length > bestLen) {
        bestId = b.id;
        bestLen = n.length;
      }
    }
  }
  return bestId;
}

/**
 * 從活動標題/備註猜住宿晚數：阿拉伯數字 + 晚/泊/night(s)。例："3晚"、"2泊3日"、"3 nights"。
 * 1–60 之外視為誤判回 null；猜不到回 null。
 */
export function parseNights(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*(?:晚|泊|nights?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 60 ? n : null;
}

/**
 * 由旅程出發日推算第 N 天的日期（YYYY-MM-DD）；旅程未設日期回 null。
 * 用 UTC 計算避免時區跨日。
 */
export function dayDateFromTrip(
  startDate: string | null | undefined,
  dayNumber: number
): string | null {
  if (!startDate || !Number.isInteger(dayNumber) || dayNumber < 1) return null;
  const ymd = startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + dayNumber - 1);
  return d.toISOString().slice(0, 10);
}

/** 行程日推算日期是否晚於旅程結束日；缺少任一日期時不視為超出範圍。 */
export function isTripDayOutsideRange(
  dayDate: string | null | undefined,
  endDate: string | null | undefined
): boolean {
  if (!dayDate || !endDate) return false;
  const endYmd = endDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) {
    return false;
  }
  return dayDate > endYmd;
}
