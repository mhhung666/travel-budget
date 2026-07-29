'use client';

import { Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toLocalDateInputValue } from '@/lib/dateInput';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onYearSelect: (year: number) => void;
  onClearDates: () => void;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  t: (key: string) => string;
}

// 日期範圍計算輔助函數
const getDateRanges = () => {
  const today = new Date();
  const formatDate = (date: Date) => toLocalDateInputValue(date);

  return {
    last7Days: {
      start: formatDate(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    last30Days: {
      start: formatDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    last90Days: {
      start: formatDate(new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000)),
      end: formatDate(today),
    },
    thisMonth: {
      start: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    },
    lastMonth: {
      start: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      end: formatDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    thisQuarter: {
      start: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)),
      end: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0)),
    },
    lastQuarter: {
      start: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 - 3, 1)),
      end: formatDate(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 0)),
    },
  };
};

const chipClass = (selected: boolean) =>
  cn(
    'inline-flex min-h-11 items-center rounded-md border px-3 py-1 text-xs font-normal transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    selected
      ? 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90'
      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
  );

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onYearSelect,
  onClearDates,
  compare,
  onCompareChange,
  t,
}: DateRangeFilterProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const dateRanges = getDateRanges();

  const isYearSelected = (year: number) =>
    startDate === `${year}-01-01` && endDate === `${year}-12-31`;

  const isRangeSelected = (range: { start: string; end: string }) =>
    startDate === range.start && endDate === range.end;

  const handleQuickSelect = (range: { start: string; end: string }) => {
    onStartDateChange(range.start);
    onEndDateChange(range.end);
  };

  // 相對與絕對快捷合併為單一晶片列，省去多段標題佔用的高度。
  const presets = [
    { label: t('last30Days'), range: dateRanges.last30Days },
    { label: t('thisMonth'), range: dateRanges.thisMonth },
    {
      label: t('thisYear'),
      range: { start: `${currentYear}-01-01`, end: `${currentYear}-12-31` },
    },
  ];

  return (
    <Card className="h-full border-muted bg-card/50">
      <CardContent className="flex h-full flex-col justify-center gap-3 p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar size={16} />
          <h3 className="text-sm font-semibold">{t('dateRange')}</h3>
        </div>

        {/* 快捷區間（相對 + 絕對） */}
        <div className="flex flex-wrap gap-1.5">
          {presets.map((item) => {
            const selected = isRangeSelected(item.range);
            return (
              <button
                type="button"
                key={item.label}
                className={chipClass(selected)}
                aria-pressed={selected}
                onClick={() => handleQuickSelect(item.range)}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            className={chipClass(!startDate && !endDate)}
            aria-pressed={!startDate && !endDate}
            onClick={onClearDates}
          >
            {t('allTime')}
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {years.map((year) => {
              const selected = isYearSelected(year);
              return (
                <button
                  type="button"
                  key={year}
                  className={cn(chipClass(selected), selected && 'font-semibold')}
                  aria-pressed={selected}
                  onClick={() => onYearSelect(year)}
                >
                  {year}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <Input
              type="date"
              aria-label={t('startDate')}
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="min-w-0 text-xs"
            />
            <ArrowRight
              size={14}
              className="hidden shrink-0 text-muted-foreground sm:block"
              aria-hidden
            />
            <Input
              type="date"
              aria-label={t('endDate')}
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate}
              className="min-w-0 text-xs"
            />
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compare}
            disabled={!startDate || !endDate}
            onChange={(event) => onCompareChange(event.target.checked)}
            className="size-4 accent-primary"
          />
          <span>{t('comparePrevious')}</span>
        </label>
      </CardContent>
    </Card>
  );
}
