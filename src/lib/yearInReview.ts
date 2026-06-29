import type { YearInReviewCategory, YearInReviewData } from '@/types';
import { haversineKm } from './geo';
import { yearsSpanned } from './dateRange';

/**
 * 年度旅行回顧（Travel Wrapped）的純計算層 —— 與 [tripStats.ts] / [settlement.ts] /
 * [expenseDigest.ts] 同樣的「可單測、無 I/O」計算函式。動作層只負責授權 + 撈資料，
 * 把原始文件投影成下列輸入後交給本檔彙整。
 *
 * 兩種年份口徑刻意不同：
 * - **地理**（趟數/國家/城市/里程/最長天數/旅伴）以「旅程起訖與該年重疊」為準
 *   （與旅行地圖、公開地圖路由共用 [dateRange.ts] `yearsSpanned` 的年份判斷）。
 * - **花費**（總額/分類/月份）以「支出日期落在該年」為準（個人分攤，比照 getStats）。
 * 兩者各自合理：花費綁日期、地理綁旅程；於資料層各自過濾。
 */

/** 一個座標點 + 國碼（出發地 / 目的地 / 行程日地點共用）。 */
export interface YearInReviewPoint {
  lat: number;
  lon: number;
  countryCode?: string | null;
}

export interface YearInReviewTrip {
  id: string;
  /** YYYY-MM-DD 或 ISO；null＝未設定。 */
  startDate?: string | null;
  endDate?: string | null;
  departure?: YearInReviewPoint | null;
  destination?: YearInReviewPoint | null;
  /** 此旅程的「真人」成員 id（虛擬成員已於資料層排除）。 */
  memberIds: string[];
}

/** 行程日地點，綁所屬旅程 id（只計入落在該年的旅程）。 */
export interface YearInReviewPlace extends YearInReviewPoint {
  tripId: string;
}

/** 個人分攤的單筆支出（金額為基準幣 TWD 的個人份額）。 */
export interface YearInReviewExpense {
  /** YYYY-MM-DD。 */
  date: string;
  category: string | null;
  shareAmount: number;
}

export interface YearInReviewInputs {
  trips: YearInReviewTrip[];
  itinerary: YearInReviewPlace[];
  expenses: YearInReviewExpense[];
  /** 目前使用者 id，用於把自己排除在「旅伴」計數之外。 */
  selfUserId: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** 含端點的天數（同一天＝1 天）；無法判定回 0。 */
function inclusiveDayCount(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

/** 座標四捨五入到小數兩位（約 ~1km），與 getVisitedPlaces 的城市去重一致。 */
function coordKey(lat: number, lon: number): string {
  return `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
}

function addCountry(set: Set<string>, code?: string | null): void {
  if (code) set.add(code.toUpperCase());
}

/**
 * 把某一年的旅行彙整成年度回顧數字。純函式、無 I/O；輸入已由資料層投影。
 */
export function computeYearInReview(inputs: YearInReviewInputs, year: number): YearInReviewData {
  const { trips, itinerary, expenses, selfUserId } = inputs;

  // 地理：起訖與該年重疊的旅程（yearsSpanned 含跨年）。
  const yearTrips = trips.filter((t) => yearsSpanned(t.startDate, t.endDate).includes(year));
  const yearTripIds = new Set(yearTrips.map((t) => t.id));

  const countrySet = new Set<string>();
  const companionSet = new Set<string>();
  let distanceKm = 0;
  let longestTripDays = 0;
  for (const t of yearTrips) {
    addCountry(countrySet, t.departure?.countryCode);
    addCountry(countrySet, t.destination?.countryCode);
    if (t.departure && t.destination) {
      distanceKm += haversineKm(
        [t.departure.lat, t.departure.lon],
        [t.destination.lat, t.destination.lon]
      );
    }
    const days = inclusiveDayCount(t.startDate, t.endDate);
    if (days > longestTripDays) longestTripDays = days;
    for (const m of t.memberIds) if (m !== selfUserId) companionSet.add(m);
  }

  // 城市：落在該年旅程的行程日地點，依座標去重；國碼一併計入國家集合。
  const citySet = new Set<string>();
  for (const p of itinerary) {
    if (!yearTripIds.has(p.tripId)) continue;
    citySet.add(coordKey(p.lat, p.lon));
    addCountry(countrySet, p.countryCode);
  }

  // 花費：支出日期落在該年（YYYY-MM-DD 字串比較，免時區誤差）。
  const yearPrefix = String(year);
  const categoryMap = new Map<string, number>();
  const monthlySpend = new Array<number>(12).fill(0);
  let totalSpend = 0;
  let expenseCount = 0;
  for (const e of expenses) {
    if (e.date.slice(0, 4) !== yearPrefix) continue;
    const amount = e.shareAmount || 0;
    const category = e.category || 'other';
    categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    const month = Number(e.date.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthlySpend[month] += amount;
    totalSpend += amount;
    expenseCount += 1;
  }

  const categoryBreakdown: YearInReviewCategory[] = Array.from(categoryMap.entries())
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);

  // busiestMonth：花費最高的月份；全為 0（無花費）時為 null。
  let busiestMonth: number | null = null;
  let maxMonth = 0;
  monthlySpend.forEach((v, i) => {
    if (v > maxMonth) {
      maxMonth = v;
      busiestMonth = i;
    }
  });

  return {
    year,
    tripCount: yearTrips.length,
    countryCount: countrySet.size,
    cityCount: citySet.size,
    distanceKm: Math.round(distanceKm),
    longestTripDays,
    companionCount: companionSet.size,
    totalSpend: Math.round(totalSpend),
    expenseCount,
    topCategory: categoryBreakdown[0] ?? null,
    categoryBreakdown,
    monthlySpend: monthlySpend.map((v) => Math.round(v)),
    busiestMonth,
  };
}

/**
 * 有資料可回顧的年份清單（新到舊）：旅程涵蓋年份 ∪ 支出日期年份。
 * 供年度回顧頁的年份切換；空陣列代表此使用者尚無任何旅行/支出。
 */
export function availableReviewYears(
  trips: Pick<YearInReviewTrip, 'startDate' | 'endDate'>[],
  expenses: Pick<YearInReviewExpense, 'date'>[]
): number[] {
  const years = new Set<number>();
  for (const t of trips) for (const y of yearsSpanned(t.startDate, t.endDate)) years.add(y);
  for (const e of expenses) {
    const y = Number(e.date.slice(0, 4));
    if (Number.isFinite(y) && y > 0) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
