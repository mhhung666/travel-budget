'use client';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from '@/i18n/navigation';
import { useAuthenticatedSession } from '@/components/providers/QueryProvider';
import { getTripLanding } from '@/actions/tripLanding.actions';
import type { TripLanding } from '@/types/tripLanding';
import { fetchWithPublicFallback } from './fetcher';
import { bootstrapLanding } from './landingBootstrap';

export function useLandingRead(id: string) {
  const client = useQueryClient();
  const pathname = usePathname();
  const authenticated = useAuthenticatedSession();
  return <K extends 'trip' | 'shell' | 'itinerary'>(
    field: K,
    fallback: () => Promise<TripLanding[K]>
  ) => {
    if (pathname !== `/trips/${id}`) return fallback();
    return bootstrapLanding(
      client,
      id,
      field,
      async () => {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return fetchWithPublicFallback(
          id,
          (tripId) => getTripLanding(tripId, date),
          { path: `landing?date=${date}` },
          null as unknown as TripLanding,
          authenticated
        );
      },
      fallback
    );
  };
}
