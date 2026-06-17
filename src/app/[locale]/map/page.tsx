'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import { TripMapView } from '@/components/map';
import { useCurrentUser, useTrips } from '@/hooks/queries';

export default function MapPage() {
  const router = useRouter();
  const t = useTranslations('map');

  const { data: user, isSuccess: userResolved } = useCurrentUser();

  // Redirect to login once we know there is no authenticated user.
  useEffect(() => {
    if (userResolved && !user) {
      router.push('/login');
    }
  }, [userResolved, user, router]);

  const { data: trips = [], isFetching: loading, isError, error: tripsError } = useTrips();

  const error = isError
    ? tripsError instanceof Error
      ? tripsError.message
      : String(tripsError)
    : '';

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        user={
          user
            ? {
                id: user.id,
                username: user.display_name || user.username,
                email: user.email,
              }
            : null
        }
        showUserMenu={true}
        title={t('title')}
      />

      <TripMapView trips={trips} loading={loading} error={error} />
    </div>
  );
}
