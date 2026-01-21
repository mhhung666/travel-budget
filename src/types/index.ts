export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
}

// 地點資訊（用於地圖顯示）
export interface Location {
  name: string; // 地點名稱（顯示用）
  display_name: string; // 完整地址
  lat: number; // 緯度
  lon: number; // 經度
  country?: string; // 國家
  country_code?: string; // 國家代碼
}

export interface Trip {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null; // 旅遊開始日期
  end_date: string | null; // 旅遊結束日期
  location: Location | null; // 旅遊地點
  created_at: string;
}

export interface TripMember {
  id: number;
  trip_id: number;
  user_id: number;
  joined_at: string;
}

export interface Expense {
  id: number;
  trip_id: number;
  payer_id: number;
  amount: number; // TWD 換算金額 (用於結算計算)
  original_amount: number; // 原始幣別金額
  currency: string; // 幣別代碼 (TWD, JPY, USD, EUR, HKD)
  exchange_rate: number; // 對 TWD 的匯率
  description: string;
  date: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: number;
  expense_id: number;
  user_id: number;
  share_amount: number;
}

export interface ExpenseWithDetails extends Expense {
  payer_name: string;
  splits: Array<{
    user_id: number;
    username: string;
    share_amount: number;
  }>;
}

export interface UserBalance {
  user_id: number;
  username: string;
  total_paid: number;
  total_owed: number;
  balance: number;
}

// 幣別定義
export interface Currency {
  code: string; // TWD, JPY, USD, EUR, HKD
  name: string; // 新台幣, 日圓, 美元, 歐元, 港幣
  symbol: string; // NT$, ¥, $, €, HK$
}

// 支援的幣別清單
export const CURRENCIES: Currency[] = [
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
  { code: 'JPY', name: '日圓', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '歐元', symbol: '€' },
  { code: 'HKD', name: '港幣', symbol: 'HK$' },
];
