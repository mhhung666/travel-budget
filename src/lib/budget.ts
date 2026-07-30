import type { Budget, BudgetProgress, CategoryBudgetProgress } from '@/types';
import { CATEGORY_CODES } from '@/constants/categories';

/**
 * 計算「我的預算 vs 我的分攤花費」進度。
 *
 * 進度刻意不存於 DB：旅程詳情頁本就載入了 budget（隨 trip）與全部 expenses，
 * 於前端即時計算可省去一次後端往返。
 *
 * 金額一律以基準幣（TWD）計：expense.amount 已是換算後的 TWD，budget 亦以 TWD 設定，
 * 故可直接相加比對。回傳金額四捨五入為整數（基準幣無小數）。
 *
 * @param budget  旅程預算設定；null 代表未設定
 * @param expenses 旅程全部支出（需含 category 與 splits）
 * @param userId 目前登入者；只加總 splits 中屬於此人的 share_amount
 */
export function computeBudgetProgress(
  budget: Budget | null,
  expenses: {
    category: string;
    splits: { user_id: string; share_amount: number }[];
  }[],
  userId: string | null
): BudgetProgress {
  const total = budget?.total ?? null;

  const categoryBudgets = new Map<string, number>();
  for (const c of budget?.categories ?? []) {
    categoryBudgets.set(c.category, c.amount);
  }

  // 統計各分類分攤給目前使用者的實際花費。
  const spentByCategory = new Map<string, number>();
  let totalSpent = 0;
  for (const e of expenses) {
    const cat = e.category || 'other';
    const amt = userId
      ? (e.splits.find((split) => split.user_id === userId)?.share_amount ?? 0)
      : 0;
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
