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
