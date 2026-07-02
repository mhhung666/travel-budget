'use client';

import { Luggage } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common';

export default function EmptyTripsState() {
  const t = useTranslations('trips');

  return <EmptyState icon={Luggage} title={t('noTrips')} description={t('noTripsDescription')} />;
}
