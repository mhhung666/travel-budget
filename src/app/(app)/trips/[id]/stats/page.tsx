'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { TripStatsView } from '@/components/stats';
import { useTrip, useTripStats, useExchangeRates } from '@/hooks/queries';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/common';
import { resolveTripRates, getTripDisplayCurrencies } from '@/lib/tripCurrency';

export default function TripStatsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tError = useTranslations('error');

  const { data: stats, isLoading: loading, isError } = useTripStats(tripId);
  const { data: trip } = useTrip(tripId);
  const { data: exchangeRates = { TWD: 1 } } = useExchangeRates();

  if (loading) {
    return <StatsDashboardSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState message={tError('loadFailed')} onBack={() => router.push(`/trips/${tripId}`)} />
    );
  }

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
      {stats && (
        <TripStatsView
          stats={stats}
          currencyOptions={getTripDisplayCurrencies(trip?.currency_settings)}
          displayRates={resolveTripRates(trip?.currency_settings, exchangeRates)}
        />
      )}
    </div>
  );
}
