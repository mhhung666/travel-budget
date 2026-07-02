'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { TripStatsView } from '@/components/stats';
import { useTrip, useTripStats } from '@/hooks/queries';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';

export default function TripStatsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');

  const { data: trip } = useTrip(tripId);
  const { data: stats, isLoading: loading, isError } = useTripStats(tripId);

  if (loading) {
    return <StatsDashboardSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState message={tError('loadFailed')} onBack={() => router.push(`/trips/${tripId}`)} />
    );
  }

  return (
    <div className="container mx-auto max-w-6xl py-6 px-4 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => router.push(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {trip?.name || tCommon('back')}
        </Button>
      </div>

      {stats && <TripStatsView stats={stats} />}
    </div>
  );
}
