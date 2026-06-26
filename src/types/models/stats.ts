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
