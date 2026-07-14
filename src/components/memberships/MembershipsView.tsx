'use client';

import { useTranslations } from 'next-intl';
import { Hotel, Plane } from 'lucide-react';

import { LoyaltyTab } from '@/components/collections';

/**
 * 會籍頁（/memberships）：航空會籍（積分記帳，複用 LoyaltyTab）＋飯店會籍（夜數制，
 * 規劃中先佔位，見 docs/PLAN-LOYALTY.md §8）。原為旅行成就頁的一個 tab，獨立成專屬頁面。
 */
export function MembershipsView() {
  const t = useTranslations('memberships');

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 pb-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subtitle')}</p>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plane className="h-4 w-4 text-primary" aria-hidden />
          {t('airlineHeading')}
        </h2>
        <LoyaltyTab />
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Hotel className="h-4 w-4 text-primary" aria-hidden />
          {t('hotelHeading')}
        </h2>
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium text-foreground">{t('hotelComingSoon')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('hotelComingSoonDesc')}</p>
        </div>
      </section>
    </div>
  );
}
