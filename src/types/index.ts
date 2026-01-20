export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
}

export interface Trip {
  id: number;
  name: string;
  description: string | null;
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
  amount: number;              // TWD 換算金額 (用於結算計算)
  original_amount: number;     // 原始幣別金額
  currency: string;            // 幣別代碼 (TWD, JPY, USD, EUR, HKD)
  exchange_rate: number;       // 對 TWD 的匯率
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
  code: string;    // TWD, JPY, USD, EUR, HKD
  name: string;    // 新台幣, 日圓, 美元, 歐元, 港幣
  symbol: string;  // NT$, ¥, $, €, HK$
}

// 支援的幣別清單
export const CURRENCIES: Currency[] = [
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
  { code: 'JPY', name: '日圓', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '歐元', symbol: '€' },
  { code: 'HKD', name: '港幣', symbol: 'HK$' },
];
