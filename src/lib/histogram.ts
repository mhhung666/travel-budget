import type { CategoryStat, HistogramData, TimeInterval, HistogramDataPoint } from '@/types';

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
  // 1. 提取所有 expense details
  const allExpenses = categoryStats.flatMap(cat => cat.details);

  // 2. 根據區間生成時段列表
  const periods = generatePeriods(interval, startDate, endDate);

  // 3. 將 expenses 分配到各時段
  const dataPoints: HistogramDataPoint[] = periods.map(period => {
    const periodExpenses = allExpenses.filter(exp =>
      exp.date >= period.startDate && exp.date <= period.endDate
    );

    return {
      period: formatPeriodLabel(period, interval, locale),
      amount: periodExpenses.reduce((sum, exp) => sum + exp.amount, 0),
      count: periodExpenses.length,
      startDate: period.startDate,
      endDate: period.endDate,
    };
  });

  return {
    interval,
    dataPoints,
    totalAmount: dataPoints.reduce((sum, dp) => sum + dp.amount, 0),
    totalCount: dataPoints.reduce((sum, dp) => sum + dp.count, 0),
  };
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
        // 按月分組
        const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        periods.push({
          startDate: monthStart.toISOString().split('T')[0],
          endDate: periodEnd.toISOString().split('T')[0],
        });
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      }
      case 'biweekly': {
        // 按兩週分組
        periodEnd = new Date(current);
        periodEnd.setDate(periodEnd.getDate() + 13); // 14 天
        if (periodEnd > end) periodEnd = new Date(end);
        periods.push({
          startDate: current.toISOString().split('T')[0],
          endDate: periodEnd.toISOString().split('T')[0],
        });
        current = new Date(periodEnd);
        current.setDate(current.getDate() + 1);
        break;
      }
      case 'week': {
        // 按週分組
        periodEnd = new Date(current);
        periodEnd.setDate(periodEnd.getDate() + 6); // 7 天
        if (periodEnd > end) periodEnd = new Date(end);
        periods.push({
          startDate: current.toISOString().split('T')[0],
          endDate: periodEnd.toISOString().split('T')[0],
        });
        current = new Date(periodEnd);
        current.setDate(current.getDate() + 1);
        break;
      }
      case 'day': {
        // 按日分組
        periods.push({
          startDate: current.toISOString().split('T')[0],
          endDate: current.toISOString().split('T')[0],
        });
        current.setDate(current.getDate() + 1);
        break;
      }
    }

    // 防止無限循環
    if (periods.length > 365) break;
  }

  return periods;
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
  const intlLocale = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';

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
    case 'biweekly':
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

  if (days > 120) return 'month';     // > 4個月 → 按月統計
  if (days > 60) return 'biweekly';   // > 2個月 → 按雙週統計
  if (days > 2) return 'week';        // > 2天 → 按週統計
  return 'day';                       // <= 2天 → 按日統計
}
