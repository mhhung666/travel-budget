'use client';
import { QueryStatus } from '@/components/common/QueryStatus';

import { useParams } from 'next/navigation';
import { TripStatsView } from '@/components/stats';
import { useTrip, useTripStats, useExchangeRates } from '@/hooks/queries';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { resolveTripRates, getTripDisplayCurrencies } from '@/lib/tripCurrency';

export default function TripStatsPage() {
  const params = useParams();
  const tripId = params.id as string;

  const query = useTripStats(tripId);
  const { data: stats, isLoading: loading } = query;
  const tripQuery = useTrip(tripId);
  const { data: trip } = tripQuery;
  const ratesQuery = useExchangeRates();
  const { data: exchangeRates = { TWD: 1 } } = ratesQuery;

  if (loading) {
    return <StatsDashboardSkeleton />;
  }

  if (query.data === undefined) return <QueryStatus query={query} />;

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-6xl py-4 px-4 sm:px-6">
      <QueryStatus query={tripQuery} />
      <QueryStatus query={query} />
      <QueryStatus query={ratesQuery} />
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
