'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { TripStatsView } from '@/components/stats';
import { useCurrentUser, useTrip, useTripStats } from '@/hooks/queries';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TripStatsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tStats = useTranslations('stats');
  const tError = useTranslations('error');
  const tCommon = useTranslations('common');

  const { data: currentUser } = useCurrentUser();
  const { data: trip } = useTrip(tripId);
  const { data: stats, isLoading: loading, isError } = useTripStats(tripId);

  if (loading) {
    return <StatsDashboardSkeleton />;
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{tError('loadFailed')}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push(`/trips/${tripId}`)} size="lg">
            {tCommon('back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar
        user={
          currentUser
            ? {
                id: currentUser.id,
                username: currentUser.display_name,
                email: currentUser.email,
              }
            : null
        }
        showUserMenu={true}
        title={tStats('tripStats')}
      />

      <div className="container mx-auto max-w-6xl pt-24 px-4 sm:px-6">
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
    </div>
  );
}
