import type {
  CategoryStat,
  DailySpend,
  ExpenseDetail,
  MemberSpend,
  TagStat,
  TripStatsData,
} from '@/types';

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
  /**
   * 關聯的行程日 id（可複選）；空/undefined＝未關聯（歸入未關聯桶）。每日花費聚合時
   * 把整筆金額「平均分攤」到所列的每一天（如跨夜飯店分散到各晚），故每天花費總和才
   * 不會超過實際支出。
   */
  itineraryDayIds?: string[] | null;
  /** 自訂標籤（可複選）；空/undefined＝無標籤。 */
  tags?: string[] | null;
}

/** 按天聚合所需的行程日中繼資料（序號 + 標題）。 */
export interface TripStatsDay {
  id: string;
  dayNumber: number;
  title: string;
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
  range: { startDate?: string | null; endDate?: string | null },
  days: TripStatsDay[] = []
): TripStatsData {
  // 分類彙總（金額為整筆）
  const categoryMap = new Map<string, { total: number; count: number; details: ExpenseDetail[] }>();
  // 自訂標籤彙總（金額為整筆；一筆支出可有多個 tag，故分別計入每個 tag 的桶，非分攤）
  const tagMap = new Map<string, { total: number; count: number; details: ExpenseDetail[] }>();
  // 成員付款／分攤
  const paidByUser = new Map<string, number>();
  const shareByUser = new Map<string, number>();
  // 按行程日聚合（dayId → { total, count }）；未關聯支出歸入 null 桶。
  const spendByDay = new Map<string | null, { total: number; count: number }>();

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

    for (const tag of e.tags ?? []) {
      const currentTag = tagMap.get(tag) || { total: 0, count: 0, details: [] };
      tagMap.set(tag, {
        total: currentTag.total + amount,
        count: currentTag.count + 1,
        details: [...currentTag.details, detail],
      });
    }

    if (e.payerId) paidByUser.set(e.payerId, (paidByUser.get(e.payerId) || 0) + amount);
    for (const s of e.splits || []) {
      shareByUser.set(s.userId, (shareByUser.get(s.userId) || 0) + (s.shareAmount || 0));
    }

    // 關聯多個行程日時把金額平均分攤到每一天（跨夜飯店分散到各晚）；未關聯歸入 null 桶。
    // count 對每個關聯日各 +1（這筆支出確實「涉及」那天），故跨日支出會在多天各列一筆。
    const dayKeys = e.itineraryDayIds && e.itineraryDayIds.length > 0 ? e.itineraryDayIds : [null];
    const perDay = amount / dayKeys.length;
    for (const dayKey of dayKeys) {
      const dayAgg = spendByDay.get(dayKey) || { total: 0, count: 0 };
      spendByDay.set(dayKey, { total: dayAgg.total + perDay, count: dayAgg.count + 1 });
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

  const tagStats: TagStat[] = Array.from(tagMap.entries())
    .map(([tag, s]) => ({
      tag,
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

  // 按行程日聚合：依 days 順序（dayNumber 升冪）列出每天總額，最後補上「未關聯」桶（若有）。
  // 沒有任何花費的行程日 total=0、count=0 仍會列出，讓使用者看到「這天還沒記帳」。
  // 完全沒有行程日時回空陣列——此時唯一的「未關聯」桶等於總額，毫無資訊量（前端不渲染卡片）。
  const orderedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const dailySpend: DailySpend[] = orderedDays.map((d) => {
    const agg = spendByDay.get(d.id) || { total: 0, count: 0 };
    return {
      dayId: d.id,
      dayNumber: d.dayNumber,
      title: d.title,
      total: Math.round(agg.total),
      count: agg.count,
    };
  });
  const unlinked = spendByDay.get(null);
  if (orderedDays.length > 0 && unlinked && unlinked.count > 0) {
    dailySpend.push({
      dayId: null,
      dayNumber: null,
      title: '',
      total: Math.round(unlinked.total),
      count: unlinked.count,
    });
  }

  return {
    categoryStats,
    tagStats,
    totalAmount,
    totalExpenses,
    memberSpends,
    memberCount,
    dayCount,
    avgPerPersonPerDay,
    dailySpend,
  };
}
