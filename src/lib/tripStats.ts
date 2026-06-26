import type { CategoryStat, ExpenseDetail, MemberSpend, TripStatsData } from '@/types';

export interface TripStatsMember {
  userId: string;
  name: string;
}

export interface TripStatsExpense {
  id: string;
  category: string | null;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // 整筆金額（基準幣 TWD），非個人分攤
  payerId: string;
  payerName: string;
  splits: { userId: string; shareAmount: number }[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** 含端點的天數（同一天 = 1 天）；無法判定時回傳 0。 */
function inclusiveDayCount(
  start: string | null | undefined,
  end: string | null | undefined
): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / MS_PER_DAY) + 1;
}

/**
 * 全團（群組）統計：分類彙總、成員付款／分攤排行、平均每人每日。
 *
 * 純函式，與 [settlement.ts] / [budget.ts] / [expenseSplit.ts] 同樣的「可單測計算層」。
 * categoryStats 與個人 StatsData 同形狀，可直接給 ExpenseHistogram / CategoryStats；
 * 每筆 detail 的 `tripName` 欄位在群組視角刻意改放「付款人」，讓明細列顯示是誰付的。
 *
 * 旅程天數優先採旅程起迄日；未設定時退而用支出的最早～最晚日期；皆無則為 0。
 */
export function computeTripStats(
  expenses: TripStatsExpense[],
  members: TripStatsMember[],
  range: { startDate?: string | null; endDate?: string | null }
): TripStatsData {
  // 分類彙總（金額為整筆）
  const categoryMap = new Map<string, { total: number; count: number; details: ExpenseDetail[] }>();
  // 成員付款／分攤
  const paidByUser = new Map<string, number>();
  const shareByUser = new Map<string, number>();

  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const e of expenses) {
    const amount = e.amount || 0;
    const category = e.category || 'other';
    const current = categoryMap.get(category) || { total: 0, count: 0, details: [] };
    const detail: ExpenseDetail = {
      id: e.id,
      date: e.date,
      description: e.description || '',
      amount: Math.round(amount),
      tripName: e.payerName, // 群組視角：明細列顯示付款人
    };
    categoryMap.set(category, {
      total: current.total + amount,
      count: current.count + 1,
      details: [...current.details, detail],
    });

    if (e.payerId) paidByUser.set(e.payerId, (paidByUser.get(e.payerId) || 0) + amount);
    for (const s of e.splits || []) {
      shareByUser.set(s.userId, (shareByUser.get(s.userId) || 0) + (s.shareAmount || 0));
    }

    if (e.date) {
      if (minDate === null || e.date < minDate) minDate = e.date;
      if (maxDate === null || e.date > maxDate) maxDate = e.date;
    }
  }

  const categoryStats: CategoryStat[] = Array.from(categoryMap.entries())
    .map(([category, s]) => ({
      category,
      total: Math.round(s.total),
      count: s.count,
      details: s.details.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    }))
    .sort((a, b) => b.total - a.total);

  const totalAmount = categoryStats.reduce((sum, c) => sum + c.total, 0);
  const totalExpenses = categoryStats.reduce((sum, c) => sum + c.count, 0);

  const memberSpends: MemberSpend[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      paid: Math.round(paidByUser.get(m.userId) || 0),
      share: Math.round(shareByUser.get(m.userId) || 0),
    }))
    .sort((a, b) => b.paid - a.paid || b.share - a.share);

  const memberCount = members.length;
  const dayCount =
    inclusiveDayCount(range.startDate, range.endDate) || inclusiveDayCount(minDate, maxDate);
  const avgPerPersonPerDay =
    memberCount > 0 && dayCount > 0 ? Math.round(totalAmount / (memberCount * dayCount)) : 0;

  return {
    categoryStats,
    totalAmount,
    totalExpenses,
    memberSpends,
    memberCount,
    dayCount,
    avgPerPersonPerDay,
  };
}
