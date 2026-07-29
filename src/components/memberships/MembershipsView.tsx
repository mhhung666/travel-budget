'use client';

import { useTranslations } from 'next-intl';
import { AirlineMemberships } from './AirlineMemberships';

/**
 * 會籍頁（/memberships）：航空積分／哩程與飯店夜數制會籍的帳戶、進度與 ledger。
 * 原為旅行成就頁的一個 tab，現已獨立成專屬頁面。
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
