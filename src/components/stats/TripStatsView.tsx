'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Users, CalendarDays, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TripStatsData } from '@/types';
import StatsSummaryCard from './StatsSummaryCard';
import CategoryStats from './CategoryStats';
import TagStats from './TagStats';
import ExpenseHistogram from './ExpenseHistogram';
import MemberSpendRanking from './MemberSpendRanking';
import DailySpendCard from './DailySpendCard';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TripStatsViewProps {
  stats: TripStatsData;
  /** 顯示幣別選項（旅程常用幣別排前）；未傳則不顯示幣別切換（一律 TWD）。 */
  currencyOptions?: string[];
  /** 顯示換算用匯率表（1 外幣 = ? TWD；自訂匯率已蓋過即時匯率）。 */
  displayRates?: Record<string, number>;
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
        <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * 群組統計呈現層（全團）：總額 + 成員/天數/平均每人每日，付款排行，及重用既有的
 * 趨勢圖（ExpenseHistogram）與分類統計（CategoryStats）。資料來自 computeTripStats。
 */
export default function TripStatsView({
  stats,
  currencyOptions,
  displayRates,
}: TripStatsViewProps) {
  const t = useTranslations('stats');
  const tCategory = useTranslations('category');
  const locale = useLocale();

  // 顯示幣別切換：金額本體是 TWD（記帳當下已換算入庫），這裡只做「顯示」換算，
  // 不追溯改寫任何支出的匯率。
  const [displayCurrency, setDisplayCurrency] = useState('TWD');
  const rate = displayCurrency === 'TWD' ? 1 : (displayRates?.[displayCurrency] ?? 1);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency: displayCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount / rate);

  const formatDate = (date: string) => new Date(date).toLocaleDateString(intlLocale(locale));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
      {currencyOptions && currencyOptions.length > 1 && (
        <div className="mb-4 flex items-center justify-end gap-2">
          <Label className="text-xs text-muted-foreground">{t('displayCurrency')}</Label>
          <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
        <div>
          <ExpenseHistogram
            categoryStats={stats.categoryStats}
            startDate=""
            endDate=""
            formatCurrency={formatCurrency}
            t={t}
            locale={locale}
            cardGradient=""
          />
        </div>
        <div>
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

      {stats.tagStats.length > 0 && (
        <TagStats
          tagStats={stats.tagStats}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          t={t}
        />
      )}
    </div>
  );
}
