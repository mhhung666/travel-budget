/**
 * 消費分攤資訊
 */
export interface ExpenseSplit {
  user_id: string;
  username: string;
  display_name: string;
  share_amount: number;
}

/**
 * 消費記錄
 */
export interface Expense {
  id: string;
  trip_id: string;
  payer_id: string;
  payer_name: string;
  /** TWD 換算金額（用於結算計算） */
  amount: number;
  /** 原始幣別金額 */
  original_amount: number;
  /** 幣別代碼 (TWD, JPY, USD, EUR, HKD) */
  currency: string;
  /** 對 TWD 的匯率 */
  exchange_rate: number;
  description: string;
  /** 消費類別 */
  category: string;
  date: string;
  created_at: string;
  splits: ExpenseSplit[];
}
