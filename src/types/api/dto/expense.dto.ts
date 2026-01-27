/**
 * 建立消費請求
 */
export interface CreateExpenseDto {
  payer_id: number;
  original_amount: number;
  currency: string;
  exchange_rate: number;
  description: string;
  category: string;
  date: string;
  /** 分攤人員 ID 列表 */
  split_with: number[];
}

/**
 * 更新消費請求
 */
export interface UpdateExpenseDto {
  original_amount?: number;
  currency?: string;
  exchange_rate?: number;
  description?: string;
  category?: string;
}
