'use client';

import { useTranslations } from 'next-intl';
import { CalendarRange } from 'lucide-react';
import type { DailySpend } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DailySpendCardProps {
  dailySpend: DailySpend[];
  formatCurrency: (amount: number) => string;
}

/**
 * 按行程日聚合的花費（連動 Expense.itineraryDays；關聯多天的支出金額平均分攤到各天）。
 * 每列一個行程日，條長以最高花費日為滿格；未關聯行程日的支出彙整在最後一列。
 * 無任何行程日時不渲染（回 null）。
 */
export default function DailySpendCard({ dailySpend, formatCurrency }: DailySpendCardProps) {
  const t = useTranslations('stats');

  if (dailySpend.length === 0) return null;

  const maxTotal = Math.max(1, ...dailySpend.map((d) => d.total));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-muted-foreground" />
          {t('dailySpend')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {dailySpend.map((d) => {
            const label =
              d.dayId === null
                ? t('unlinkedDay')
                : `${t('dayLabel', { dayNumber: d.dayNumber ?? 0 })}${d.title ? ` · ${d.title}` : ''}`;
            return (
              <li key={d.dayId ?? '__unlinked__'}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{label}</span>
                  <span className="shrink-0 text-sm font-semibold">{formatCurrency(d.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      d.dayId === null ? 'bg-muted-foreground/40' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.round((d.total / maxTotal) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('expenseCount', { count: d.count })}
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
