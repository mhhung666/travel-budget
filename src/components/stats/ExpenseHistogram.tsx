'use client';

import { useState, useMemo, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface ExpenseHistogramProps {
  categoryStats: CategoryStat[];
  startDate: string;
  endDate: string;
  formatCurrency: (amount: number) => string;
  cardGradient: string;
  t: (key: string) => string;
  locale: string;
}

export default function ExpenseHistogram({
  categoryStats,
  startDate,
  endDate,
  formatCurrency,
  t,
  locale,
}: ExpenseHistogramProps) {
  // 計算日期範圍天數
  const daysDiff = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  // 初始區間：智能推薦
  const defaultInterval = useMemo(
    () => (startDate && endDate ? suggestInterval(startDate, endDate) : 'day'),
    [startDate, endDate]
  );

  const [interval, setInterval] = useState<TimeInterval>(defaultInterval);

  // 根據日期範圍決定可用的區間選項
  const availableIntervals = useMemo(() => {
    const intervals: TimeInterval[] = [];

    // 按日：始終可用
    intervals.push('day');

    // 按週：> 2天時可用
    if (daysDiff > 2) {
      intervals.push('week');
    }

    // 按月：> 90天時可用
    if (daysDiff > 90) {
      intervals.push('month');
    }

    return intervals;
  }, [daysDiff]);

  // 當可用區間改變時，確保當前選擇的區間仍然可用
  useEffect(() => {
    if (!availableIntervals.includes(interval)) {
      // 如果當前區間不可用，切換到第一個可用的區間
      setInterval(availableIntervals[0] || 'day');
    }
  }, [availableIntervals, interval]);

  // 聚合數據
  const histogramData = useMemo(() => {
    if (!startDate || !endDate) return null;
    return aggregateExpensesByInterval(
      categoryStats,
      interval,
      startDate,
      endDate,
      locale
    );
  }, [categoryStats, interval, startDate, endDate, locale]);

  // 自定義 Tooltip（recharts 會傳入 active 與 payload）
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload: HistogramDataPoint }[];
  }) => {
    if (!active || !payload?.[0]) return null;
    const data = payload[0].payload;
    const dateFormat = locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';

    const formatDateRange = (startDate: string, endDate: string) => {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (startDate === endDate) {
        return new Intl.DateTimeFormat(dateFormat, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(start);
      } else if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(start)} - ${end.getDate()}`;
      } else if (start.getFullYear() === end.getFullYear()) {
        return `${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat(dateFormat, { month: 'short', day: 'numeric' }).format(end)}`;
      } else {
        return `${new Intl.DateTimeFormat(dateFormat, { year: 'numeric', month: 'short', day: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat(dateFormat, { year: 'numeric', month: 'short', day: 'numeric' }).format(end)}`;
      }
    };

    return (
      <div className="bg-background/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
        <span className="block text-xs font-semibold mb-1">
          {formatDateRange(data.startDate, data.endDate)}
        </span>
        <span className="text-lg font-bold text-primary block">
          {formatCurrency(data.amount)}
        </span>
        <span className="text-xs text-muted-foreground">
          {data.count} {t('expenses')}
        </span>
      </div>
    );
  };

  return (
    <Card className="border-none shadow-none mb-4 bg-transparent">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BarChart3 size={20} />
          </div>
          <h2 className="text-xl font-bold">
            {t('expenseHistogram')}
          </h2>
        </div>

        {/* 時間區間選擇器 */}
        <div className="flex items-center p-1 bg-muted rounded-lg w-fit">
          {[
            { value: 'day', label: t('intervalDay') },
            { value: 'week', label: t('intervalWeek') },
            { value: 'month', label: t('intervalMonth') },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setInterval(option.value as TimeInterval)}
              disabled={!availableIntervals.includes(option.value as TimeInterval)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                interval === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <CardContent className="p-0">
        {/* Chart */}
        {histogramData && histogramData.dataPoints.length > 0 ? (
          <div className="w-full h-[350px]">
            <ResponsiveContainer>
              <BarChart data={histogramData.dataPoints} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="period"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.2)" }} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {histogramData.dataPoints.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.amount > 0
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-12">
            <BarChart3 size={48} strokeWidth={1} className="opacity-30 mb-4 mx-auto" />
            <p className="text-muted-foreground">
              {t('noData')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
