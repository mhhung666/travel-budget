'use client';

import { useTranslations } from 'next-intl';

export default function EmptyTripsState() {
  const t = useTranslations('trips');

  return (
    <div className="text-center py-16">
      <p className="text-lg text-muted-foreground mb-2">{t('noTrips')}</p>
      <p className="text-sm text-muted-foreground">{t('noTripsDescription')}</p>
    </div>
  );
}
