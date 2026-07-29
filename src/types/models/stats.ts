export interface ExpenseDetail {
  id: string;
  date: string;
  description: string;
  amount: number;
  tripName: string;
  tripId?: string;
  category?: string;
  tags?: string[];
}

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

/**
 * 單一自訂標籤的花費彙總（ROADMAP #18）。與 CategoryStat 同形狀，但 key 為自由文字
 * 的 tag 而非固定分類；一筆支出可有多個 tag，故金額會分別計入每個 tag 的桶（非分攤）。
 */
export interface TagStat {
  tag: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

export interface PersonalTripStat {
  tripId: string;
  tripName: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

export interface StatsData {
  categoryStats: CategoryStat[];
  tripStats: PersonalTripStat[];
  tagStats: TagStat[];
  totalAmount: number;
  totalExpenses: number;
  tripCount: number;
  averagePerTrip: number;
  startDate: string | null;
  endDate: string | null;
  recentExpenses: ExpenseDetail[];
}

/**
 * 單一成員在某趟旅程的花費（群組統計用）。
 * `paid` = 以付款人身分付出的總額；`share` = 被分攤到的總額。皆為基準幣 TWD。
 */
export interface MemberSpend {
  userId: string;
  name: string;
  paid: number;
  share: number;
}

/**
 * 單一行程日的花費彙總（按天聚合）。total/ count 為關聯到此行程日的支出總和。
 * dayId 為 null 代表「未關聯行程日」的支出彙總（恆排在最後）。
 */
export interface DailySpend {
  /** 行程日 id；null＝未關聯行程日的彙總桶。 */
  dayId: string | null;
  /** 行程日序號；未關聯桶為 null。 */
  dayNumber: number | null;
  /** 行程日標題；未關聯桶為空字串。 */
  title: string;
  /** 此行程日的支出總額（基準幣 TWD，整筆）。 */
  total: number;
  /** 此行程日的支出筆數。 */
  count: number;
}

/**
 * 群組（全團）統計資料 — 不以 splits.user 過濾，金額為整筆支出而非個人分攤。
 * categoryStats / totalAmount / totalExpenses 與個人 StatsData 同形狀，故可直接餵給
 * 既有的 ExpenseHistogram / CategoryStats 元件。
 */
export interface TripStatsData {
  categoryStats: CategoryStat[];
  tagStats: TagStat[];
  totalAmount: number;
  totalExpenses: number;
  memberSpends: MemberSpend[];
  memberCount: number;
  dayCount: number;
  avgPerPersonPerDay: number;
  /** 按行程日聚合的花費（行程日序升冪，未關聯桶在最後）。無任何行程日時為空陣列。 */
  dailySpend: DailySpend[];
}

/** 年度回顧的單一分類花費（個人分攤，基準幣 TWD）。 */
export interface YearInReviewCategory {
  category: string;
  total: number;
}

/**
 * 年度旅行回顧（Travel Wrapped）：把某一年的旅行彙整成可分享的數字。
 *
 * 兩種口徑（與 [lib/yearInReview.ts] 一致）：**地理**（趟數/國家/城市/里程/最長天數/
 * 旅伴）取「起訖與該年重疊的旅程」；**花費**（個人分攤）取「支出日期落在該年」者。
 * 金額僅於登入檢視與本人下載的圖卡呈現；公開分享連結為去識別化、不含任何金額欄位。
 */
export interface YearInReviewData {
  year: number;
  // 地理
  tripCount: number;
  countryCount: number;
  cityCount: number;
  distanceKm: number;
  longestTripDays: number;
  companionCount: number;
  // 花費（個人分攤，基準幣 TWD）
  totalSpend: number;
  expenseCount: number;
  topCategory: YearInReviewCategory | null;
  categoryBreakdown: YearInReviewCategory[];
  /** 各月花費，長度 12（索引 0＝一月）。 */
  monthlySpend: number[];
  /** 花費最高的月份（0–11）；該年完全無花費時為 null。 */
  busiestMonth: number | null;
  // 旅行成就（FEATURES §16）：該年航班/住宿數與「新解鎖」航空/品牌數。
  // optional——公開分享 payload（去識別化）不含這些欄位，僅登入檢視有。
  flightCount?: number;
  newAirlineCount?: number;
  stayCount?: number;
  newBrandCount?: number;
}

// 時間區間類型
export type TimeInterval = 'day' | 'week' | 'month';

// 直方圖數據點
export interface HistogramDataPoint {
  period: string; // 時間標籤（例如："1月", "Week 1", "1"）
  amount: number; // 該時段總金額
  count: number; // 該時段支出筆數
  startDate: string; // 該時段起始日期 YYYY-MM-DD
  endDate: string; // 該時段結束日期 YYYY-MM-DD
}

// 直方圖數據
export interface HistogramData {
  interval: TimeInterval;
  dataPoints: HistogramDataPoint[];
  totalAmount: number;
  totalCount: number;
}
