import type { Expense } from '@/types';

/**
 * 支出列表的篩選條件（純前端，套用在已載入的全量支出上）。
 *
 * 不走伺服端分頁/查詢：旅程詳情頁本就為了預算試算載入全部支出，故在 client 端過濾即可，
 * 也避免與「載入全部以算預算」的設計衝突（見 IMPROVEMENTS.md G——伺服端游標分頁屬未來鋪路）。
 */
export interface ExpenseFilters {
  /** 關鍵字：比對描述 + 付款人名稱，大小寫不敏感（空字串＝不過濾）。 */
  keyword: string;
  /** 分類 code；'all'＝不過濾。 */
  category: string;
  /** 付款人 user id；'all'＝不過濾。 */
  payerId: string;
  /** 分帳對象 user id（須出現在 splits 中）；'all'＝不過濾。 */
  participantId: string;
  /** 起始日（含），'YYYY-MM-DD'；''＝不限。 */
  dateFrom: string;
  /** 結束日（含），'YYYY-MM-DD'；''＝不限。 */
  dateTo: string;
}

export const EMPTY_EXPENSE_FILTERS: ExpenseFilters = {
  keyword: '',
  category: 'all',
  payerId: 'all',
  participantId: 'all',
  dateFrom: '',
  dateTo: '',
};

/**
 * 取支出日期的 'YYYY-MM-DD' 部分。DTO 的 `date` 已是 `toDateStr` 產生的 'YYYY-MM-DD'
 * （見 [dto.ts](./dto.ts)），與 `<input type="date">` 同格式，故可直接做字典序比較。
 * 這裡仍 slice 一次作為防呆（萬一傳入帶時間的 ISO 字串）。
 */
function toDateKey(date: string): string {
  return date.slice(0, 10);
}

/** 依條件過濾支出。所有條件以 AND 結合；未設定的條件略過。回傳保留原順序。 */
export function filterExpenses(expenses: Expense[], filters: ExpenseFilters): Expense[] {
  const keyword = filters.keyword.trim().toLowerCase();

  return expenses.filter((expense) => {
    if (keyword) {
      const haystack = `${expense.description} ${expense.payer_name}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    if (filters.category !== 'all' && expense.category !== filters.category) return false;

    if (filters.payerId !== 'all' && expense.payer_id !== filters.payerId) return false;

    if (
      filters.participantId !== 'all' &&
      !expense.splits.some((split) => split.user_id === filters.participantId)
    ) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const day = toDateKey(expense.date);
      if (filters.dateFrom && day < filters.dateFrom) return false;
      if (filters.dateTo && day > filters.dateTo) return false;
    }

    return true;
  });
}

/**
 * 啟用中的篩選條件數量（給 UI 的「篩選」按鈕顯示 badge）。日期區間（起/迄）合計算一項。
 */
export function countActiveFilters(filters: ExpenseFilters): number {
  let count = 0;
  if (filters.keyword.trim()) count++;
  if (filters.category !== 'all') count++;
  if (filters.payerId !== 'all') count++;
  if (filters.participantId !== 'all') count++;
  if (filters.dateFrom || filters.dateTo) count++;
  return count;
}
