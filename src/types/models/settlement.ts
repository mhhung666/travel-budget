/**
 * 用戶餘額狀態
 */
export interface UserBalance {
  user_id: string;
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
  from_id: string;
  from_name: string;
  to_id: string;
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
  userId: string;
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

/**
 * 已登記的還款紀錄（客戶端顯示用）。
 * 金額一律基準幣 TWD，與 balances / transactions 同單位，結算時淨額抵銷。
 */
export interface PaymentRecord {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

/**
 * 結算結果（含淨額後的餘額、建議轉帳、已登記還款）。
 */
export interface Settlement {
  balances: Balance[];
  transactions: Transaction[];
  payments: PaymentRecord[];
  totalExpenses: number;
}
