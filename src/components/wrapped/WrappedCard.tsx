'use client';

import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Plane,
  Globe2,
  Building2,
  Route,
  Wallet,
  Tag,
  Users,
  CalendarDays,
  Compass,
} from 'lucide-react';
import type { YearInReviewData } from '@/types';

export interface WrappedCardProps {
  review: YearInReviewData;
  /** 是否呈現金額（登入檢視/本人下載＝true；公開分享＝false，去識別化契約）。 */
  includeMoney: boolean;
  /** 顯示在頁尾的擁有者名稱（可選）。 */
  ownerName?: string;
  /** 在地化的金額格式化（僅 includeMoney 時使用）。 */
  formatMoney?: (amount: number) => string;
}

function StatTile({
  icon: Icon,
  value,
  label,
  suffix,
}: {
  icon: typeof Plane;
  value: string | number;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
      <Icon className="h-5 w-5 text-white/80" />
      <div className="text-2xl font-extrabold leading-none tracking-tight sm:text-3xl">
        {value}
        {suffix && <span className="ml-0.5 text-sm font-semibold text-white/70">{suffix}</span>}
      </div>
      <div className="text-xs font-medium text-white/70">{label}</div>
    </div>
  );
}

/**
 * 年度回顧的可分享卡片（gradient、大數字）。同時是 html-to-image 的擷取目標，故：
 * 用 forwardRef 讓父層拿到 DOM 節點；內部**不放遠端圖片**（頭像等，避免擷取時 CORS 髒掉），
 * 只用文字 + lucide 向量圖示。`includeMoney=false` 時隱藏所有金額（公開分享去識別化）。
 */
export const WrappedCard = forwardRef<HTMLDivElement, WrappedCardProps>(function WrappedCard(
  { review, includeMoney, ownerName, formatMoney },
  ref
) {
  const t = useTranslations('wrapped');
  const tc = useTranslations('category');

  const distance =
    review.distanceKm >= 1000
      ? `${(review.distanceKm / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`
      : String(review.distanceKm);

  const money = formatMoney ?? ((n: number) => String(n));

  return (
    <div
      ref={ref}
      className="relative mx-auto flex w-full max-w-md flex-col gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl sm:p-8"
    >
      {/* 裝飾光暈 */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-fuchsia-300/20 blur-3xl" />

      {/* 標題 */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <Compass className="h-4 w-4" />
          {t('title')}
        </div>
        <div className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
          {t('heading', { year: review.year })}
        </div>
        <div className="mt-1 text-sm text-white/80">{t('subtitle')}</div>
      </div>

      {/* 地理數字（恆顯示） */}
      <div className="relative z-10 grid grid-cols-2 gap-3">
        <StatTile icon={Plane} value={review.tripCount} label={t('stat.trips')} />
        <StatTile icon={Globe2} value={review.countryCount} label={t('stat.countries')} />
        <StatTile icon={Building2} value={review.cityCount} label={t('stat.cities')} />
        <StatTile icon={Route} value={distance} label={t('stat.distance')} suffix="km" />
      </div>

      {/* 花費（僅本人/登入檢視） */}
      {includeMoney && (
        <div className="relative z-10 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-white/70">
            <Wallet className="h-4 w-4" />
            {t('stat.spend')}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {money(review.totalSpend)}
            </span>
            <span className="text-xs font-medium text-white/70">
              · {review.expenseCount} {t('stat.expenses')}
            </span>
          </div>
          {review.topCategory && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-white/80">
              <Tag className="h-3.5 w-3.5" />
              {t('topCategory')}：{tc(review.topCategory.category)}
            </div>
          )}
        </div>
      )}

      {/* 旅伴 / 最長旅程（小註腳列） */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
        {review.companionCount > 0 && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {review.companionCount} {t('stat.companions')}
          </span>
        )}
        {review.longestTripDays > 0 && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {t('stat.longestTrip')} · {t('days', { count: review.longestTripDays })}
          </span>
        )}
      </div>

      {ownerName && (
        <div className="relative z-10 text-right text-xs font-medium text-white/60">
          {ownerName}
        </div>
      )}
    </div>
  );
});
