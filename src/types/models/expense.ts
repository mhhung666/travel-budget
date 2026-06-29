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
 * 收據附件（前端 DTO）。實際檔案在 R2 私有 bucket，這裡只帶 key + 中繼資料，不含
 * 可直接存取的 URL；要檢視時呼叫 getReceiptUrl 取得短效簽名 URL。
 */
export interface ExpenseAttachment {
  /** R2 物件 key，同時作為前端識別此附件的 id。 */
  key: string;
  content_type: string;
  size: number;
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
  /** 幣別代碼 (TWD, JPY, USD, EUR, HKD, THB) */
  currency: string;
  /** 對 TWD 的匯率 */
  exchange_rate: number;
  description: string;
  /** 消費類別 */
  category: string;
  date: string;
  created_at: string;
  splits: ExpenseSplit[];
  attachments: ExpenseAttachment[];
  /** 關聯的行程日 id（同 trip 下的 ItineraryDay）；可複選，未關聯時為空陣列。 */
  itinerary_day_ids: string[];
}
