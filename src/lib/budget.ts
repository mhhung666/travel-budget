import type { Budget, BudgetProgress, CategoryBudgetProgress } from '@/types';
import { CATEGORY_CODES } from '@/constants/categories';

/**
 * 計算「預算 vs 實際」進度（純函式，無 I/O，故可單元測試 — 比照 lib/settlement.ts）。
 *
 * 進度刻意不存於 DB：旅程詳情頁本就載入了 budget（隨 trip）與全部 expenses，
 * 於前端即時計算可省去一次後端往返（呼應 CLAUDE.md 的「避免額外往返」原則）。
 *
 * 金額一律以基準幣（TWD）計：expense.amount 已是換算後的 TWD，budget 亦以 TWD 設定，
 * 故可直接相加比對。回傳金額四捨五入為整數（基準幣無小數）。
 *
 * @param budget  旅程預算設定；null 代表未設定
 * @param expenses 旅程全部支出（需含 amount 與 category）
 */
export function computeBudgetProgress(
  budget: Budget | null,
  expenses: { amount: number; category: string }[]
): BudgetProgress {
  const total = budget?.total ?? null;

  const categoryBudgets = new Map<string, number>();
  for (const c of budget?.categories ?? []) {
    categoryBudgets.set(c.category, c.amount);
  }

  // 統計各分類實際花費（全團）
  const spentByCategory = new Map<string, number>();
  let totalSpent = 0;
  for (const e of expenses) {
    const cat = e.category || 'other';
    const amt = e.amount || 0;
    totalSpent += amt;
    spentByCategory.set(cat, (spentByCategory.get(cat) ?? 0) + amt);
  }

  // 取「有預算」∪「有花費」的分類，依固定分類順序排列；未知分類（資料異常）補在最後
  const involved = new Set<string>([...categoryBudgets.keys(), ...spentByCategory.keys()]);
  const ordered = CATEGORY_CODES.filter((c) => involved.has(c));
  for (const c of involved) {
    if (!ordered.includes(c)) ordered.push(c);
  }

  const categories: CategoryBudgetProgress[] = ordered.map((category) => ({
    category,
    budget: categoryBudgets.has(category) ? (categoryBudgets.get(category) as number) : null,
    spent: Math.round(spentByCategory.get(category) ?? 0),
  }));

  const hasBudget = total !== null || categoryBudgets.size > 0;

  return {
    total,
    totalSpent: Math.round(totalSpent),
    categories,
    hasBudget,
  };
}
