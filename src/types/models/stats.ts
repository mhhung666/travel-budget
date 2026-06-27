export interface ExpenseDetail {
  id: string;
  date: string;
  description: string;
  amount: number;
  tripName: string;
}

export interface CategoryStat {
  category: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
}

export interface StatsData {
  categoryStats: CategoryStat[];
  totalAmount: number;
  totalExpenses: number;
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
  totalAmount: number;
  totalExpenses: number;
  memberSpends: MemberSpend[];
  memberCount: number;
  dayCount: number;
  avgPerPersonPerDay: number;
  /** 按行程日聚合的花費（行程日序升冪，未關聯桶在最後）。無任何行程日時為空陣列。 */
  dailySpend: DailySpend[];
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
