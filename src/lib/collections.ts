/**
 * 旅行成就（Collections，ROADMAP #19）的純計算層——與 [tripStats.ts] / [yearInReview.ts]
 * 同樣「可單測、無 I/O」。輸入為 getCollections 回傳的紀錄清單（已依日期新到舊），
 * 於前端把「逐筆紀錄」彙整成「航空公司 / 飯店品牌」的收集視角。
 */

export interface AirlineSummaryInput {
  /** IATA 航空公司代碼。 */
  airline: string;
  /** YYYY-MM-DD。 */
  date: string;
}

export interface AirlineSummary {
  airline: string;
  count: number;
  /** 最早 / 最近一次搭乘（YYYY-MM-DD）。 */
  firstDate: string;
  lastDate: string;
}

/**
 * 依航空公司分組計數。排序：次數多→少，同次數依代碼字典序（穩定、與輸入順序無關）。
 */
export function summarizeAirlines(flights: AirlineSummaryInput[]): AirlineSummary[] {
  const map = new Map<string, AirlineSummary>();
  for (const f of flights) {
    const cur = map.get(f.airline);
    if (!cur) {
      map.set(f.airline, { airline: f.airline, count: 1, firstDate: f.date, lastDate: f.date });
    } else {
      cur.count += 1;
      if (f.date < cur.firstDate) cur.firstDate = f.date;
      if (f.date > cur.lastDate) cur.lastDate = f.date;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.airline.localeCompare(b.airline));
}

export interface BrandSummaryInput {
  /** 品牌目錄 id；null＝獨立旅宿/未知品牌。 */
  brand: string | null;
  hotelName: string;
  /** 入住日 YYYY-MM-DD。 */
  checkIn: string;
  nights: number | null;
}

export interface BrandSummary {
  brand: string | null;
  stayCount: number;
  /** 已知晚數加總（nights 為 null 的紀錄不計入）。 */
  nights: number;
  /** 住過的飯店名（去重、依輸入順序）。 */
  hotelNames: string[];
  firstDate: string;
  lastDate: string;
}

/**
 * 依品牌分組（品牌牆的資料形狀）。null 品牌也彙整成一組（UI 顯示為「獨立/其他」）。
 * 排序：入住次數多→少，同次數依最近入住新→舊。
 */
export function summarizeBrands(stays: BrandSummaryInput[]): BrandSummary[] {
  const map = new Map<string | null, BrandSummary & { names: Set<string> }>();
  for (const s of stays) {
    let cur = map.get(s.brand);
    if (!cur) {
      cur = {
        brand: s.brand,
        stayCount: 0,
        nights: 0,
        hotelNames: [],
        names: new Set(),
        firstDate: s.checkIn,
        lastDate: s.checkIn,
      };
      map.set(s.brand, cur);
    }
    cur.stayCount += 1;
    cur.nights += s.nights ?? 0;
    if (s.hotelName && !cur.names.has(s.hotelName)) {
      cur.names.add(s.hotelName);
      cur.hotelNames.push(s.hotelName);
    }
    if (s.checkIn < cur.firstDate) cur.firstDate = s.checkIn;
    if (s.checkIn > cur.lastDate) cur.lastDate = s.checkIn;
  }
  return [...map.values()]
    .map(({ names: _names, ...rest }) => rest)
    .sort((a, b) => b.stayCount - a.stayCount || b.lastDate.localeCompare(a.lastDate));
}

/**
 * 依日期精度把 YYYY-MM-DD 截成顯示用字串（year → YYYY、month → YYYY-MM、day 原樣）。
 */
export function formatByPrecision(date: string, precision: 'day' | 'month' | 'year'): string {
  if (precision === 'year') return date.slice(0, 4);
  if (precision === 'month') return date.slice(0, 7);
  return date;
}
