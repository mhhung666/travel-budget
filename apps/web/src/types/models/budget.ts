/**
 * 個人旅程預算與「我的預算 vs 我的分攤花費」進度。
 *
 * 金額一律以基準幣（TWD）計，與 Expense.amount 同單位。進度（BudgetProgress）
 * 不存於資料庫，而是由登入者的 budget 設定 + 旅程支出 splits 即時計算得出。
 */

/** 單一分類預算 */
export interface BudgetCategory {
  category: string;
  amount: number;
}

/** 個人旅程預算設定；null（在 DTO 中）代表尚未設定 */
export interface Budget {
  /** 總預算；null 代表未設總額（仍可只設分類預算） */
  total: number | null;
  categories: BudgetCategory[];
}

/** 單一分類的預算 vs 實際 */
export interface CategoryBudgetProgress {
  category: string;
  /** 此分類的預算；null 代表未替此分類設預算 */
  budget: number | null;
  /** 此分類分攤給目前使用者的實際花費（TWD） */
  spent: number;
}

/** 預算總覽，由 {@link Budget} + 支出計算 */
export interface BudgetProgress {
  /** 總預算；null 代表未設總額 */
  total: number | null;
  /** 分攤給目前使用者的總花費（TWD） */
  totalSpent: number;
  /** 各分類進度：含「有設預算」或「有花費」的分類聯集 */
  categories: CategoryBudgetProgress[];
  /** 是否設定了任何預算（總額或任一分類） */
  hasBudget: boolean;
}
