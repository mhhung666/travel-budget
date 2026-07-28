'use client';

import { useTranslations } from 'next-intl';
import { AirlineMemberships } from './AirlineMemberships';

/**
 * 會籍頁（/memberships）：航空／飯店兩個 tab（比照旅行成就頁的分頁設計）。
 * 航空＝積分／哩程記帳與升等進度（國泰、長榮…）；飯店＝夜數制，規劃中先佔位
 * （見 docs/PLAN-LOYALTY.md §8）。原為旅行成就頁的一個 tab，已獨立成專屬頁面。
 */
export function MembershipsView() {
  const t = useTranslations('memberships');

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <AirlineMemberships />
    </div>
  );
}
