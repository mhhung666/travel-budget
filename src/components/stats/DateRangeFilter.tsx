'use client';

import { Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const isYearSelected = (year: number) => {
    return startDate === `${year}-01-01` && endDate === `${year}-12-31`;
  };

  const isRangeSelected = (range: { start: string; end: string }) => {
    return startDate === range.start && endDate === range.end;
  };

  const handleQuickSelect = (range: { start: string; end: string }) => {
    onStartDateChange(range.start);
    onEndDateChange(range.end);
  };

  return (
    <Card className="h-full border-muted bg-card/50">
      <CardContent className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-primary" />
          <h3 className="text-lg font-bold">{t('dateRange')}</h3>
        </div>

        {/* 相對時間快捷選項 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {t('quickRelative')}
          </Label>
          <div className="flex flex-wrap gap-2">
            {[
              { label: t('last7Days'), range: dateRanges.last7Days },
              { label: t('last30Days'), range: dateRanges.last30Days },
              { label: t('last90Days'), range: dateRanges.last90Days },
            ].map((item, idx) => {
              const isSelected = isRangeSelected(item.range);
              return (
                <Badge
                  key={idx}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer px-3 py-1 hover:bg-primary/90 transition-colors',
                    !isSelected && 'hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleQuickSelect(item.range)}
                >
                  {item.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* 絕對時間快捷選項 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {t('quickAbsolute')}
          </Label>
          <div className="flex flex-wrap gap-2">
            {[
              { label: t('thisMonth'), range: dateRanges.thisMonth },
              { label: t('lastMonth'), range: dateRanges.lastMonth },
              { label: t('thisQuarter'), range: dateRanges.thisQuarter },
              { label: t('lastQuarter'), range: dateRanges.lastQuarter },
            ].map((item, idx) => {
              const isSelected = isRangeSelected(item.range);
              return (
                <Badge
                  key={idx}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer px-3 py-1 hover:bg-primary/90 transition-colors',
                    !isSelected && 'hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleQuickSelect(item.range)}
                >
                  {item.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* 年度快速選擇 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {t('quickYear')}
          </Label>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => {
              const isSelected = isYearSelected(year);
              return (
                <Badge
                  key={year}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer px-3 py-1 hover:bg-primary/90 transition-colors',
                    !isSelected && 'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'font-bold'
                  )}
                  onClick={() => onYearSelect(year)}
                >
                  {year}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* 自訂日期範圍 */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {t('customRange')}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="flex-1"
            />
            <ArrowRight size={16} className="text-muted-foreground" />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={startDate}
              className="flex-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
