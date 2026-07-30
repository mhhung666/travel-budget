import type {
  CategoryStat,
  ExpenseDetail,
  HistogramData,
  StatsTimelineData,
  TimeInterval,
} from '@/types';

type TimelineExpense = Pick<ExpenseDetail, 'date' | 'amount'>;
const MAX_TIMELINE_BUCKETS = 366;

/**
 * Server-safe timeline aggregation. Labels are added by the client so cached
 * data can be rendered using the active locale.
 */
export function aggregateTimeline(
  expenses: TimelineExpense[],
  interval: TimeInterval,
  startDate: string,
  endDate: string
): StatsTimelineData {
  const periods = generatePeriods(interval, startDate, endDate);
  const bucketIndexes = new Map(periods.map((period, index) => [period.startDate, index]));
  const dataPoints = periods.map((period) => ({ ...period, amount: 0, count: 0 }));

  for (const expense of expenses) {
    if (expense.date < startDate || expense.date > endDate) continue;

    const bucketStart = timelinePeriodStart(expense.date, interval, startDate);
    const index = bucketIndexes.get(bucketStart);
    if (index === undefined) continue;

    dataPoints[index].amount += expense.amount;
    dataPoints[index].count += 1;
  }

  return {
    interval,
    dataPoints,
    totalAmount: dataPoints.reduce((sum, point) => sum + point.amount, 0),
    totalCount: dataPoints.reduce((sum, point) => sum + point.count, 0),
  };
}

/**
 * 根據時間區間聚合支出數據
 */
export function aggregateExpensesByInterval(
  categoryStats: CategoryStat[],
  interval: TimeInterval,
  startDate: string,
  endDate: string,
  locale: string
): HistogramData {
  const allExpenses = categoryStats.flatMap((cat) => cat.details);
  return localizeTimeline(aggregateTimeline(allExpenses, interval, startDate, endDate), locale);
}

export function localizeTimeline(timeline: StatsTimelineData, locale: string): HistogramData {
  return {
    ...timeline,
    dataPoints: timeline.dataPoints.map((point) => ({
      ...point,
      period: formatPeriodLabel(point, timeline.interval, locale),
    })),
  };
}

function timelinePeriodStart(date: string, interval: TimeInterval, rangeStart: string): string {
  if (interval === 'day') return date;
  if (interval === 'month') return `${date.slice(0, 7)}-01`;

  const dayOffset = Math.floor(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) / 86400000
  );
  const bucketOffset = Math.floor(dayOffset / 7) * 7;
  const bucketStart = new Date(`${rangeStart}T00:00:00Z`);
  bucketStart.setUTCDate(bucketStart.getUTCDate() + bucketOffset);
  return formatDateToString(bucketStart);
}

/**
 * 生成時段列表
 */
function generatePeriods(
  interval: TimeInterval,
  startDate: string,
  endDate: string
): Array<{ startDate: string; endDate: string }> {
  const periods: Array<{ startDate: string; endDate: string }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    let periodEnd: Date;

    switch (interval) {
      case 'month': {
        // 按月分組 - 使用 UTC 時間避免時區問題
        const year = current.getUTCFullYear();
        const month = current.getUTCMonth();
        const monthStart = new Date(Date.UTC(year, month, 1));
        periodEnd = new Date(Date.UTC(year, month + 1, 0));
        periods.push({
          startDate: formatDateToString(monthStart),
          endDate: formatDateToString(periodEnd),
        });
        current = new Date(Date.UTC(year, month + 1, 1));
        break;
      }
      case 'week': {
        // 按週分組
        periodEnd = new Date(current);
        periodEnd.setUTCDate(periodEnd.getUTCDate() + 6); // 7 天
        if (periodEnd > end) periodEnd = new Date(end);
        periods.push({
          startDate: formatDateToString(current),
          endDate: formatDateToString(periodEnd),
        });
        current = new Date(periodEnd);
        current.setUTCDate(current.getUTCDate() + 1);
        break;
      }
      case 'day': {
        // 按日分組
        periods.push({
          startDate: formatDateToString(current),
          endDate: formatDateToString(current),
        });
        current.setUTCDate(current.getUTCDate() + 1);
        break;
      }
    }
  }

  return periods;
}

/**
 * 將日期格式化為 YYYY-MM-DD 字符串，避免時區問題
 */
function formatDateToString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化時段標籤（支持多語言）
 */
function formatPeriodLabel(
  period: { startDate: string; endDate: string },
  interval: TimeInterval,
  locale: string
): string {
  const startDate = new Date(period.startDate);
  const endDate = new Date(period.endDate);
  const intlLocale =
    locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';

  switch (interval) {
    case 'month':
      // "1月", "Jan", "1月" 或跨年時顯示 "2024/1月"
      const monthLabel = new Intl.DateTimeFormat(intlLocale, { month: 'short' }).format(startDate);
      // 如果是跨年數據，加上年份
      const currentYear = new Date().getFullYear();
      if (startDate.getFullYear() !== currentYear) {
        return `${startDate.getFullYear()}/${monthLabel}`;
      }
      return monthLabel;
    case 'week': {
      // 顯示日期範圍：如 "1/1-1/7" 或跨月時 "12/25-1/7"
      const startMonth = startDate.getMonth() + 1;
      const startDay = startDate.getDate();
      const endMonth = endDate.getMonth() + 1;
      const endDay = endDate.getDate();

      if (startMonth === endMonth) {
        // 同月：顯示 "1/1-7"
        return `${startMonth}/${startDay}-${endDay}`;
      } else {
        // 跨月：顯示 "12/25-1/7"
        return `${startMonth}/${startDay}-${endMonth}/${endDay}`;
      }
    }
    case 'day':
      // 顯示 "月/日" 格式，如 "1/15"
      return `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    default:
      return period.startDate;
  }
}

/**
 * 根據日期範圍推薦時間區間
 */
export function suggestInterval(startDate: string, endDate: string): TimeInterval {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (days > 90) return 'month'; // > 3 個月 → 按月統計
  if (days > 31) return 'week'; // 約 1~3 個月 → 按週統計
  return 'day'; // 一個月以內 → 按日統計（避免單月被切成長短不一的週柱）
}

export function availableTimelineIntervals(startDate: string, endDate: string): TimeInterval[] {
  const daySpan =
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
    ) + 1;

  const intervals: TimeInterval[] = [
    ...(daySpan <= MAX_TIMELINE_BUCKETS ? (['day'] as const) : []),
    ...(daySpan > 3 && Math.ceil(daySpan / 7) <= MAX_TIMELINE_BUCKETS ? (['week'] as const) : []),
    ...(daySpan > 90 ? (['month'] as const) : []),
  ];
  return intervals.length ? intervals : ['month'];
}

export function resolveTimelineInterval(
  startDate: string,
  endDate: string,
  requested?: TimeInterval
): TimeInterval {
  const available = availableTimelineIntervals(startDate, endDate);
  return requested && available.includes(requested)
    ? requested
    : suggestInterval(startDate, endDate);
}
