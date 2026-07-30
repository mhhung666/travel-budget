'use client';

import { useMemo } from 'react';
import { BarChart3, X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  aggregateExpensesByInterval,
  availableTimelineIntervals,
  localizeTimeline,
  resolveTimelineInterval,
} from '@/lib/histogram';
import type { CategoryStat, TimeInterval, HistogramDataPoint, StatsTimelineData } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Metric = 'amount' | 'count';

interface ExpenseHistogramProps {
  categoryStats?: CategoryStat[];
  timeline?: StatsTimelineData;
  startDate: string;
  endDate: string;
  formatCurrency: (amount: number) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  metric?: Metric;
  onMetricChange?: (metric: Metric) => void;
  interval?: TimeInterval;
  onIntervalChange?: (interval: TimeInterval) => void;
  cardGradient?: string;
  selectedPeriod?: { startDate: string; endDate: string } | null;
  onPeriodSelect?: (period: { startDate: string; endDate: string } | null) => void;
}

type ChartPoint = HistogramDataPoint;

function compactNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export default function ExpenseHistogram({
  categoryStats = [],
  timeline,
  startDate,
  endDate,
  formatCurrency,
  t,
  locale,
  metric = 'amount',
  onMetricChange = () => undefined,
  interval: requestedInterval,
  onIntervalChange,
  selectedPeriod,
  onPeriodSelect,
}: ExpenseHistogramProps) {
  const [effectiveStart, effectiveEnd] = useMemo<[string, string]>(() => {
    if (startDate && endDate) return [startDate, endDate];
    const dates = categoryStats.flatMap((category) =>
      category.details.map((detail) => detail.date)
    );
    return [
      startDate ||
        dates.reduce((minimum, date) => (date < minimum ? date : minimum), dates[0] || ''),
      endDate || dates.reduce((maximum, date) => (date > maximum ? date : maximum), dates[0] || ''),
    ];
  }, [categoryStats, startDate, endDate]);

  const availableIntervals: TimeInterval[] =
    effectiveStart && effectiveEnd
      ? availableTimelineIntervals(effectiveStart, effectiveEnd)
      : ['day'];
  const interval =
    timeline?.interval ??
    (effectiveStart && effectiveEnd
      ? resolveTimelineInterval(effectiveStart, effectiveEnd, requestedInterval)
      : 'day');

  const points = useMemo<ChartPoint[]>(() => {
    if (!effectiveStart || !effectiveEnd) return [];
    if (timeline) return localizeTimeline(timeline, locale).dataPoints;
    return aggregateExpensesByInterval(
      categoryStats,
      interval,
      effectiveStart,
      effectiveEnd,
      locale
    ).dataPoints;
  }, [categoryStats, timeline, interval, effectiveStart, effectiveEnd, locale]);

  const selectedKey = selectedPeriod
    ? `${selectedPeriod.startDate}:${selectedPeriod.endDate}`
    : undefined;
  const valueKey = metric === 'amount' ? 'amount' : 'count';
  const chartPointWidth = 24;
  const minimumChartWidth = points.length * chartPointWidth;

  return (
    <Card className="border-muted bg-card/60">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <BarChart3 size={20} aria-hidden />
          </div>
          <div>
            <h2 className="font-semibold">{t('expenseHistogram')}</h2>
            <p className="text-xs text-muted-foreground">{t('chartHint')}</p>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1" aria-label={t('metric')}>
            {(['amount', 'count'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={metric === value}
                onClick={() => onMetricChange(value)}
                className={cn(
                  'min-h-11 rounded-md px-2 text-sm sm:px-3',
                  metric === value && 'bg-background font-medium shadow-sm'
                )}
              >
                {t(value === 'amount' ? 'amountMetric' : 'countMetric')}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 rounded-lg bg-muted p-1" aria-label={t('interval')}>
            {(['day', 'week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={!availableIntervals.includes(value)}
                aria-pressed={interval === value}
                onClick={() => onIntervalChange?.(value)}
                className={cn(
                  'min-h-11 rounded-md px-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 sm:px-3',
                  interval === value && 'bg-background font-medium shadow-sm'
                )}
              >
                {t(`interval${value[0].toUpperCase()}${value.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <CardContent className="px-2 pb-5 sm:px-5">
        {points.length ? (
          <>
            <div
              className="w-full touch-pan-x overflow-x-auto overscroll-x-contain pb-2"
              role="region"
              aria-label={t('expenseHistogram')}
              tabIndex={0}
            >
              <div className="h-[320px]" style={{ width: `max(100%, ${minimumChartWidth}px)` }}>
                <ResponsiveContainer>
                  <BarChart
                    data={points}
                    barCategoryGap="20%"
                    barGap={2}
                    margin={{ top: 8, right: 8, left: 0, bottom: 24 }}
                    onClick={(state) => {
                      const point = (
                        state as unknown as {
                          activePayload?: { payload?: ChartPoint }[];
                        }
                      )?.activePayload?.[0]?.payload;
                      if (point)
                        onPeriodSelect?.({ startDate: point.startDate, endDate: point.endDate });
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={54}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={48}
                      tickFormatter={(value) => compactNumber(Number(value), locale)}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                      formatter={(value) => [
                        metric === 'amount' ? formatCurrency(Number(value)) : Number(value),
                        t(metric === 'amount' ? 'amountMetric' : 'countMetric'),
                      ]}
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as ChartPoint | undefined;
                        return point
                          ? `${point.startDate}${point.startDate === point.endDate ? '' : ` – ${point.endDate}`}`
                          : '';
                      }}
                    />
                    <Bar dataKey={valueKey} radius={[5, 5, 0, 0]} maxBarSize={20}>
                      {points.map((point) => (
                        <Cell
                          key={`${point.startDate}:${point.endDate}`}
                          fill={
                            selectedKey === `${point.startDate}:${point.endDate}`
                              ? 'hsl(var(--foreground))'
                              : 'hsl(var(--primary))'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div
              className="mt-2 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
              role="region"
              aria-label={t('chartData')}
              tabIndex={0}
            >
              {points.map((point) => {
                const selected = selectedKey === `${point.startDate}:${point.endDate}`;
                return (
                  <button
                    type="button"
                    key={`${point.startDate}:${point.endDate}`}
                    aria-pressed={selected}
                    onClick={() =>
                      onPeriodSelect?.(
                        selected ? null : { startDate: point.startDate, endDate: point.endDate }
                      )
                    }
                    className={cn(
                      'min-h-11 shrink-0 rounded-lg border px-3 text-left text-xs',
                      selected && 'border-primary bg-primary/10'
                    )}
                  >
                    <span className="block font-medium">{point.period}</span>
                    <span className="text-muted-foreground">
                      {metric === 'amount' ? formatCurrency(point.amount) : point.count}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedPeriod && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => onPeriodSelect?.(null)}
              >
                <X size={16} aria-hidden />
                {t('clearChartFilter')}
              </Button>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-muted-foreground">{t('noData')}</div>
        )}
      </CardContent>
    </Card>
  );
}
