'use client';

import { useMemo, useState } from 'react';
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
import { aggregateExpensesByInterval, suggestInterval } from '@/lib/histogram';
import type { CategoryStat, TimeInterval, HistogramDataPoint } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Metric = 'amount' | 'count';

interface ExpenseHistogramProps {
  categoryStats: CategoryStat[];
  comparisonStats?: CategoryStat[];
  startDate: string;
  endDate: string;
  comparisonStartDate?: string;
  comparisonEndDate?: string;
  formatCurrency: (amount: number) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  metric?: Metric;
  onMetricChange?: (metric: Metric) => void;
  cardGradient?: string;
  selectedPeriod?: { startDate: string; endDate: string } | null;
  onPeriodSelect?: (period: { startDate: string; endDate: string } | null) => void;
}

type ChartPoint = HistogramDataPoint & {
  comparisonAmount?: number;
  comparisonCount?: number;
};

function compactNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export default function ExpenseHistogram({
  categoryStats,
  comparisonStats = [],
  startDate,
  endDate,
  comparisonStartDate,
  comparisonEndDate,
  formatCurrency,
  t,
  locale,
  metric = 'amount',
  onMetricChange = () => undefined,
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

  const suggestedInterval =
    effectiveStart && effectiveEnd ? suggestInterval(effectiveStart, effectiveEnd) : 'day';
  const rangeKey = `${effectiveStart}:${effectiveEnd}`;
  const [intervalChoice, setIntervalChoice] = useState<{
    rangeKey: string;
    value: TimeInterval;
  }>({ rangeKey, value: suggestedInterval });
  const interval = intervalChoice.rangeKey === rangeKey ? intervalChoice.value : suggestedInterval;

  const daySpan =
    effectiveStart && effectiveEnd
      ? Math.round(
          (Date.parse(`${effectiveEnd}T00:00:00Z`) - Date.parse(`${effectiveStart}T00:00:00Z`)) /
            86400000
        ) + 1
      : 0;
  const availableIntervals: TimeInterval[] = [
    'day',
    ...(daySpan > 3 ? (['week'] as const) : []),
    ...(daySpan > 90 ? (['month'] as const) : []),
  ];

  const points = useMemo<ChartPoint[]>(() => {
    if (!effectiveStart || !effectiveEnd) return [];
    const current = aggregateExpensesByInterval(
      categoryStats,
      interval,
      effectiveStart,
      effectiveEnd,
      locale
    ).dataPoints;
    if (!comparisonStartDate || !comparisonEndDate || comparisonStats.length === 0) return current;
    const previous = aggregateExpensesByInterval(
      comparisonStats,
      interval,
      comparisonStartDate,
      comparisonEndDate,
      locale
    ).dataPoints;
    return current.map((point, index) => ({
      ...point,
      comparisonAmount: previous[index]?.amount ?? 0,
      comparisonCount: previous[index]?.count ?? 0,
    }));
  }, [
    categoryStats,
    comparisonStats,
    interval,
    effectiveStart,
    effectiveEnd,
    comparisonStartDate,
    comparisonEndDate,
    locale,
  ]);

  const selectedKey = selectedPeriod
    ? `${selectedPeriod.startDate}:${selectedPeriod.endDate}`
    : undefined;
  const valueKey = metric === 'amount' ? 'amount' : 'count';
  const comparisonKey = metric === 'amount' ? 'comparisonAmount' : 'comparisonCount';

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
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg bg-muted p-1" aria-label={t('metric')}>
            {(['amount', 'count'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={metric === value}
                onClick={() => onMetricChange(value)}
                className={cn(
                  'min-h-11 rounded-md px-3 text-sm',
                  metric === value && 'bg-background font-medium shadow-sm'
                )}
              >
                {t(value === 'amount' ? 'amountMetric' : 'countMetric')}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-muted p-1" aria-label={t('interval')}>
            {(['day', 'week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={!availableIntervals.includes(value)}
                aria-pressed={interval === value}
                onClick={() => setIntervalChoice({ rangeKey, value })}
                className={cn(
                  'min-h-11 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40',
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
            <div className="h-[320px] w-full" aria-label={t('expenseHistogram')}>
              <ResponsiveContainer>
                <BarChart
                  data={points}
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
                    formatter={(value, name) => [
                      metric === 'amount' ? formatCurrency(Number(value)) : Number(value),
                      name === comparisonKey ? t('previousPeriod') : t('currentPeriod'),
                    ]}
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload as ChartPoint | undefined;
                      return point
                        ? `${point.startDate}${point.startDate === point.endDate ? '' : ` – ${point.endDate}`}`
                        : '';
                    }}
                  />
                  {comparisonStats.length > 0 && (
                    <Bar dataKey={comparisonKey} fill="hsl(var(--muted-foreground) / 0.3)" />
                  )}
                  <Bar dataKey={valueKey} radius={[5, 5, 0, 0]}>
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
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label={t('chartData')}>
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
