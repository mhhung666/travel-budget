/**
 * 用戶餘額狀態
 */
export interface UserBalance {
  user_id: number;
  username: string;
  display_name: string;
  /** 總共支付金額 */
  total_paid: number;
  /** 總共欠款金額 */
  total_owed: number;
  /** 餘額（正數=別人欠他，負數=他欠別人） */
  balance: number;
}

/**
 * 轉帳建議
 */
export interface Transfer {
  from_id: number;
  from_name: string;
  to_id: number;
  to_name: string;
  amount: number;
}

/**
 * 結算資料
 */
export interface SettlementData {
  balances: UserBalance[];
  transfers: Transfer[];
  total_expenses: number;
}

/**
 * 用戶餘額（客戶端顯示用，camelCase）
 */
export interface Balance {
  userId: number;
  username: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
}

/**
 * 轉帳交易（客戶端顯示用）
 */
export interface Transaction {
  from: string;
  to: string;
  amount: number;
}
