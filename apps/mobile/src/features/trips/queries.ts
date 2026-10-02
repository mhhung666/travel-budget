import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { landingSchema, tripsSchema } from '@/api/contracts';
import { useAuth } from '@/features/auth/AuthProvider';

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
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
export const useOnline = () =>
  useSyncExternalStore(
    onlineManager.subscribe,
    () => onlineManager.isOnline(),
    () => true
  );
export function useTrips() {
  const { manager, user } = useAuth();
  const date = useToday();
  return useInfiniteQuery({
    queryKey: [manager.api.baseUrl, user?.id, 'trips', date],
    enabled: !!user,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      manager.request(`/trips?page=${pageParam}&date=${date}`, tripsSchema, { signal }),
    getNextPageParam: (page) => page.nextPage ?? undefined,
  });
}
export function useTrip(id: string) {
  const { manager, user } = useAuth();
  const date = useToday();
  return useQuery({
    queryKey: [manager.api.baseUrl, user?.id, 'trip', id, date],
    enabled: !!user,
    queryFn: ({ signal }) =>
      manager.request(`/trips/${encodeURIComponent(id)}/landing?date=${date}`, landingSchema, {
        signal,
      }),
  });
}
export function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'TWD',
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
