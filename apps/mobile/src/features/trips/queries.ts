import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  infiniteQueryOptions,
  queryOptions,
  useQueryClient,
  onlineManager,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import {
  tripsV2Schema,
  tripSelectionV2Schema,
  tripListQuerySchema,
  type TripListQuery,
} from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { landingSchema, tripsSchema } from '@/api/contracts';
import type { SessionManager } from '@/api/session';
import { useAuth } from '@/features/auth/AuthProvider';
import { resetTripPages } from './tripListCache';
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
    queryKey: [manager.api.environment, user?.id, 'trips', date, 'v2'],
    enabled: !!user,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      manager.request(`/trips?page=${pageParam}&date=${date}`, tripsSchema, { signal }),
    getNextPageParam: (page) => page.nextPage ?? undefined,
  });
}
type TripListMode = Pick<TripListQuery, 'archive' | 'sort'>;
type ListRequester = Pick<SessionManager, 'requestAs'> & {
  api: Pick<SessionManager['api'], 'environment'>;
};
/** T2/T3 readers opt in explicitly; the existing screens keep their legacy query for T1. */
export const tripListQuery = (
  manager: ListRequester,
  userId: string | undefined,
  date: string,
  mode: TripListMode
) => {
  const input = tripListQuerySchema.parse({ date, ...mode });
  return infiniteQueryOptions({
    // Keep the resource prefix so existing successful writes invalidate every list mode.
    queryKey: [manager.api.environment, userId, 'trips', date, 'v2', input.archive, input.sort],
    enabled: !!userId,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      if (!userId) throw new ApiError('CANCELLED');
      const result = await manager.requestAs(
        userId,
        `/trips?page=${pageParam}&date=${date}&archive=${input.archive}&sort=${input.sort}`,
        tripsV2Schema,
        { signal }
      );
      if (
        !result.metadata ||
        result.metadata.archive !== input.archive ||
        result.metadata.sort !== input.sort ||
        result.metadata.date !== date
      )
        throw new ApiError('TRIP_LIST_SERVICE_UNAVAILABLE');
      return tripSelectionV2Schema.parse(result);
    },
    getNextPageParam: (page) => page.nextPage ?? undefined,
  });
};
export function useTripList(mode: TripListMode) {
  const { manager, user } = useAuth();
  const client = useQueryClient();
  const options = tripListQuery(manager, user?.id, useToday(), mode);
  const query = useInfiniteQuery({
    ...options,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { refetch } = query;
  const refresh = useCallback(async () => {
    await client.cancelQueries({ queryKey: [manager.api.environment, user?.id, 'trips'] });
    resetTripPages(client, manager.api.environment, user?.id);
    return refetch();
  }, [client, manager, user?.id, refetch]);
  useEffect(() => {
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const connection = onlineManager.subscribe((connected) => {
      if (connected) void refresh();
    });
    return () => {
      foreground.remove();
      connection();
    };
  }, [refresh]);
  return { ...query, refresh };
}
export const tripQuery = (
  manager: Pick<SessionManager, 'request'> & { api: Pick<SessionManager['api'], 'environment'> },
  userId: string | undefined,
  id: string,
  date: string
) =>
  queryOptions({
    queryKey: [manager.api.environment, userId, 'trip', id, date, 'v2'],
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
