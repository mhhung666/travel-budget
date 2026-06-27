'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Users, CalendarDays, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TripStatsData } from '@/types';
import StatsSummaryCard from './StatsSummaryCard';
import CategoryStats from './CategoryStats';
import ExpenseHistogram from './ExpenseHistogram';
import MemberSpendRanking from './MemberSpendRanking';
import DailySpendCard from './DailySpendCard';
import { Card, CardContent } from '@/components/ui/card';

interface TripStatsViewProps {
  stats: TripStatsData;
}

function intlLocale(locale: string): string {
  return locale === 'zh'
    ? 'zh-TW'
    : locale === 'jp'
      ? 'ja-JP'
      : locale === 'zh-CN'
        ? 'zh-CN'
        : 'en-US';
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col justify-center gap-1 p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon size={14} />
          {label}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * 群組統計呈現層（全團）：總額 + 成員/天數/平均每人每日，付款排行，及重用既有的
 * 趨勢圖（ExpenseHistogram）與分類統計（CategoryStats）。資料來自 computeTripStats。
 */
export default function TripStatsView({ stats }: TripStatsViewProps) {
  const t = useTranslations('stats');
  const tCategory = useTranslations('category');
  const locale = useLocale();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDate = (date: string) => new Date(date).toLocaleDateString(intlLocale(locale));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* 總額 + 成員/天數/平均每人每日 */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-5">
          <StatsSummaryCard
            totalAmount={stats.totalAmount}
            totalExpenses={stats.totalExpenses}
            formatCurrency={formatCurrency}
            t={t}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 md:col-span-7">
          <MetricTile icon={Users} label={t('members')} value={String(stats.memberCount)} />
          <MetricTile icon={CalendarDays} label={t('days')} value={String(stats.dayCount)} />
          <MetricTile
            icon={TrendingUp}
            label={t('avgPerPersonPerDay')}
            value={formatCurrency(stats.avgPerPersonPerDay)}
          />
        </div>
      </div>

      {/* 付款排行 + 每日花費（按行程日聚合；無行程日時 DailySpendCard 不渲染） */}
      <div
        className={`mb-6 grid grid-cols-1 gap-6 ${stats.dailySpend.length > 0 ? 'lg:grid-cols-2' : ''}`}
      >
        <MemberSpendRanking memberSpends={stats.memberSpends} formatCurrency={formatCurrency} />
        <DailySpendCard dailySpend={stats.dailySpend} formatCurrency={formatCurrency} />
      </div>

      {/* 趨勢圖 + 分類統計並排 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ExpenseHistogram
          categoryStats={stats.categoryStats}
          startDate=""
          endDate=""
          formatCurrency={formatCurrency}
          t={t}
          locale={locale}
          cardGradient=""
        />
        <CategoryStats
          categoryStats={stats.categoryStats}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          t={t}
          tCategory={tCategory}
          cardGradient=""
        />
      </div>
    </div>
  );
}
