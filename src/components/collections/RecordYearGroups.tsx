'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** 未能判定年份的紀錄集中到一組，排在最後。 */
const UNDATED = ' ';

interface RecordYearGroupsProps<T> {
  /** 已由後端排序（新到舊）的紀錄。 */
  items: T[];
  /** 取每筆的日期字串（YYYY-MM-DD）以推年份。 */
  getDate: (item: T) => string;
  /** 每筆列的呈現（需含 key）。 */
  renderRow: (item: T) => ReactNode;
}

/**
 * 逐筆紀錄的「依年份分組摺疊」呈現（ROADMAP #19 優化）：終身紀錄累積很多時，
 * 全部平舖會佔滿整頁；改成每年一個可摺疊區塊（標題＝年份＋當年筆數），
 * 預設只展開最近一年，其餘收合，像旅行時間軸。
 */
export function RecordYearGroups<T>({ items, getDate, renderRow }: RecordYearGroupsProps<T>) {
  const t = useTranslations('collections');

  const groups = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const date = getDate(item);
      const key = /^\d{4}/.test(date) ? date.slice(0, 4) : UNDATED;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([year, rows]) => ({ year, rows }));
  }, [items, getDate]);

  // 預設只展開最近一年（第一組）；使用者可自行展開/收合其餘。
  const [open, setOpen] = useState<Set<string>>(() =>
    groups[0] ? new Set([groups[0].year]) : new Set()
  );

  const toggle = (year: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <div className="space-y-2">
      {groups.map(({ year, rows }) => {
        const label = year === UNDATED ? t('common.undated') : year;
        const isOpen = open.has(year);
        return (
          <Collapsible key={year} open={isOpen} onOpenChange={() => toggle(year)} asChild>
            <Card>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('common.recordsCount', { count: rows.length })}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180'
                    )}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="divide-y border-t p-0">{rows.map(renderRow)}</CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
