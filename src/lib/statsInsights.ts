import type { ExpenseDetail, StatsData } from '@/types';

export const STATS_INSIGHT_RULES = {
  maxInsights: 3,
  maxInsightsPerTrip: 2,
  categoryConcentration: { minimumExpenses: 3, minimumShare: 0.45 },
  singleExpenseConcentration: { minimumExpenses: 3, minimumShare: 0.35 },
  spendingDayConcentration: {
    minimumExpenses: 4,
    minimumSpendingDays: 2,
    minimumShare: 0.4,
  },
  balancedCategoryDistribution: {
    minimumExpenses: 4,
    minimumCategories: 3,
    maximumTopCategoryShare: 0.4,
  },
  tagConcentration: { minimumTaggedExpenses: 3, minimumShare: 0.5 },
} as const;

export type StatsInsightType =
  | 'trip_category_concentration'
  | 'single_expense_concentration'
  | 'spending_day_concentration'
  | 'balanced_category_distribution'
  | 'trip_tag_concentration';

export interface StatsInsightFilter {
  tripId: string;
  category?: string;
  tag?: string;
  startDate?: string;
  endDate?: string;
  expenseId?: string;
}

export interface StatsInsight {
  id: string;
  type: StatsInsightType;
  tripId: string;
  tripName: string;
  amount: number;
  percentage?: number;
  sampleSize: number;
  category?: string;
  tag?: string;
  date?: string;
  expenseDescription?: string;
  categoryCount?: number;
  filter: StatsInsightFilter;
}

type RankedInsight = StatsInsight & {
  priority: number;
  thresholdDelta: number;
};

const PRIORITY: Record<StatsInsightType, number> = {
  single_expense_concentration: 0,
  spending_day_concentration: 1,
  trip_category_concentration: 2,
  trip_tag_concentration: 3,
  balanced_category_distribution: 4,
};

function positiveDetails(details: ExpenseDetail[]) {
  return details.filter((detail) => detail.amount > 0);
}

function sum(details: ExpenseDetail[]) {
  return details.reduce((total, detail) => total + detail.amount, 0);
}

function topBucket(
  details: ExpenseDetail[],
  keyFor: (detail: ExpenseDetail) => string | undefined
) {
  const buckets = new Map<string, { amount: number; details: ExpenseDetail[] }>();
  for (const detail of details) {
    const key = keyFor(detail);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { amount: 0, details: [] };
    bucket.amount += detail.amount;
    bucket.details.push(detail);
    buckets.set(key, bucket);
  }
  return Array.from(buckets, ([key, value]) => ({ key, ...value })).sort(
    (a, b) => b.amount - a.amount || a.key.localeCompare(b.key)
  )[0];
}

function candidate(insight: StatsInsight, thresholdDelta: number): RankedInsight {
  return {
    ...insight,
    priority: PRIORITY[insight.type],
    thresholdDelta,
  };
}

export function generateStatsInsights(stats: Pick<StatsData, 'tripStats'>): StatsInsight[] {
  const candidates: RankedInsight[] = [];

  for (const trip of stats.tripStats) {
    const details = positiveDetails(trip.details);
    const total = sum(details);
    if (!total) continue;

    const base = {
      tripId: trip.tripId,
      tripName: trip.tripName,
      sampleSize: details.length,
    };
    const topExpense = [...details].sort(
      (a, b) => b.amount - a.amount || a.id.localeCompare(b.id)
    )[0];
    const topExpenseShare = topExpense.amount / total;
    if (
      details.length >= STATS_INSIGHT_RULES.singleExpenseConcentration.minimumExpenses &&
      topExpenseShare >= STATS_INSIGHT_RULES.singleExpenseConcentration.minimumShare
    ) {
      candidates.push(
        candidate(
          {
            ...base,
            id: `single:${trip.tripId}:${topExpense.id}`,
            type: 'single_expense_concentration',
            amount: topExpense.amount,
            percentage: topExpenseShare,
            expenseDescription: topExpense.description,
            filter: { tripId: trip.tripId, expenseId: topExpense.id },
          },
          topExpenseShare - STATS_INSIGHT_RULES.singleExpenseConcentration.minimumShare
        )
      );
    }

    const topDay = topBucket(details, (detail) => detail.date);
    const spendingDays = new Set(details.map((detail) => detail.date)).size;
    const topDayShare = topDay ? topDay.amount / total : 0;
    const duplicatesTopExpense =
      topDay?.details.length === 1 && topDay.details[0]?.id === topExpense.id;
    if (
      topDay &&
      !duplicatesTopExpense &&
      details.length >= STATS_INSIGHT_RULES.spendingDayConcentration.minimumExpenses &&
      spendingDays >= STATS_INSIGHT_RULES.spendingDayConcentration.minimumSpendingDays &&
      topDayShare >= STATS_INSIGHT_RULES.spendingDayConcentration.minimumShare
    ) {
      candidates.push(
        candidate(
          {
            ...base,
            id: `day:${trip.tripId}:${topDay.key}`,
            type: 'spending_day_concentration',
            amount: topDay.amount,
            percentage: topDayShare,
            date: topDay.key,
            filter: {
              tripId: trip.tripId,
              startDate: topDay.key,
              endDate: topDay.key,
            },
          },
          topDayShare - STATS_INSIGHT_RULES.spendingDayConcentration.minimumShare
        )
      );
    }

    const topCategory = topBucket(details, (detail) => detail.category || 'other');
    const categoryCount = new Set(details.map((detail) => detail.category || 'other')).size;
    const topCategoryShare = topCategory ? topCategory.amount / total : 0;
    if (
      topCategory &&
      details.length >= STATS_INSIGHT_RULES.categoryConcentration.minimumExpenses &&
      topCategoryShare >= STATS_INSIGHT_RULES.categoryConcentration.minimumShare
    ) {
      candidates.push(
        candidate(
          {
            ...base,
            id: `category:${trip.tripId}:${topCategory.key}`,
            type: 'trip_category_concentration',
            amount: topCategory.amount,
            percentage: topCategoryShare,
            category: topCategory.key,
            filter: { tripId: trip.tripId, category: topCategory.key },
          },
          topCategoryShare - STATS_INSIGHT_RULES.categoryConcentration.minimumShare
        )
      );
    } else if (
      topCategory &&
      details.length >= STATS_INSIGHT_RULES.balancedCategoryDistribution.minimumExpenses &&
      categoryCount >= STATS_INSIGHT_RULES.balancedCategoryDistribution.minimumCategories &&
      topCategoryShare < STATS_INSIGHT_RULES.balancedCategoryDistribution.maximumTopCategoryShare
    ) {
      candidates.push(
        candidate(
          {
            ...base,
            id: `balanced:${trip.tripId}`,
            type: 'balanced_category_distribution',
            amount: total,
            categoryCount,
            filter: { tripId: trip.tripId },
          },
          STATS_INSIGHT_RULES.balancedCategoryDistribution.maximumTopCategoryShare -
            topCategoryShare
        )
      );
    }

    const taggedDetails = details.filter((detail) => detail.tags?.length);
    const topTag = topBucket(
      taggedDetails.flatMap((detail) =>
        (detail.tags ?? []).map((tag) => ({ ...detail, tags: [tag] }))
      ),
      (detail) => detail.tags?.[0]
    );
    const topTagShare = topTag ? topTag.amount / total : 0;
    if (
      topTag &&
      taggedDetails.length >= STATS_INSIGHT_RULES.tagConcentration.minimumTaggedExpenses &&
      topTagShare >= STATS_INSIGHT_RULES.tagConcentration.minimumShare
    ) {
      candidates.push(
        candidate(
          {
            ...base,
            id: `tag:${trip.tripId}:${topTag.key}`,
            type: 'trip_tag_concentration',
            amount: topTag.amount,
            percentage: topTagShare,
            tag: topTag.key,
            filter: { tripId: trip.tripId, tag: topTag.key },
          },
          topTagShare - STATS_INSIGHT_RULES.tagConcentration.minimumShare
        )
      );
    }
  }

  const perTrip = new Map<string, number>();
  return candidates
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.thresholdDelta - a.thresholdDelta ||
        b.amount - a.amount ||
        a.id.localeCompare(b.id)
    )
    .filter((insight) => {
      const count = perTrip.get(insight.tripId) ?? 0;
      if (count >= STATS_INSIGHT_RULES.maxInsightsPerTrip) return false;
      perTrip.set(insight.tripId, count + 1);
      return true;
    })
    .slice(0, STATS_INSIGHT_RULES.maxInsights)
    .map(({ priority: _priority, thresholdDelta: _thresholdDelta, ...insight }) => insight);
}
