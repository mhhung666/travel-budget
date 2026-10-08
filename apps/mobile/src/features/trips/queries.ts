import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { landingSchema, tripsSchema } from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { keepAccessDenial } from '@/features/auth/accessGuard';
import { localDate } from '@/i18n/format';

function useToday() {
  const [date, setDate] = useState(localDate);
  useEffect(() => {
    const update = () => setDate(localDate());
    const subscription = AppState.addEventListener('change', update);
    const timer = setInterval(update, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  return date;
}
export function useTrips() {
  const { manager, user } = useAuth();
  const date = useToday();
  return useInfiniteQuery({
    queryKey: [manager.api.baseUrl, user?.id, 'trips', date, 'v2'],
    enabled: !!user,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      manager.request(`/trips?page=${pageParam}&date=${date}`, tripsSchema, { signal }),
    getNextPageParam: (page) => page.nextPage ?? undefined,
  });
}
export const tripQuery = (
  manager: Pick<SessionManager, 'request'> & { api: Pick<SessionManager['api'], 'baseUrl'> },
  userId: string | undefined,
  id: string,
  date: string
) =>
  queryOptions({
    queryKey: [manager.api.baseUrl, userId, 'trip', id, date, 'v2'],
    enabled: !!userId,
    queryFn: ({ client, queryKey, signal }) =>
      keepAccessDenial(client, queryKey, () =>
        manager.request(`/trips/${encodeURIComponent(id)}/landing?date=${date}`, landingSchema, {
          signal,
        })
      ),
  });
export function useTrip(id: string) {
  const { manager, user } = useAuth();
  const date = useToday();
  return useQuery(tripQuery(manager, user?.id, id, date));
}
