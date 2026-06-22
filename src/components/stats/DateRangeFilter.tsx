'use client';

import { Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onYearSelect: (year: number) => void;
  t: (key: string) => string;
}

// 日期範圍計算輔助函數
const getDateRanges = () => {
  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

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
    'cursor-pointer px-2.5 py-1 text-xs font-normal transition-colors',
    selected ? 'hover:bg-primary/90' : 'hover:bg-accent hover:text-accent-foreground'
  );

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onYearSelect,
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
    { label: t('last7Days'), range: dateRanges.last7Days },
    { label: t('last30Days'), range: dateRanges.last30Days },
    { label: t('last90Days'), range: dateRanges.last90Days },
    { label: t('thisMonth'), range: dateRanges.thisMonth },
    { label: t('lastMonth'), range: dateRanges.lastMonth },
    { label: t('thisQuarter'), range: dateRanges.thisQuarter },
    { label: t('lastQuarter'), range: dateRanges.lastQuarter },
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
              <Badge
                key={item.label}
                variant={selected ? 'default' : 'outline'}
                className={chipClass(selected)}
                onClick={() => handleQuickSelect(item.range)}
              >
                {item.label}
              </Badge>
            );
          })}
        </div>

        {/* 年度 + 自訂範圍同一列，wrap 後在窄螢幕自動換行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {years.map((year) => {
              const selected = isYearSelected(year);
              return (
                <Badge
                  key={year}
                  variant={selected ? 'default' : 'outline'}
                  className={cn(chipClass(selected), selected && 'font-semibold')}
                  onClick={() => onYearSelect(year)}
                >
                  {year}
                </Badge>
              );
            })}
          </div>

          <div className="flex flex-1 items-center gap-1.5">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate}
              className="h-8 flex-1 text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
