'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getCurrentUser,
  getTrips,
  getTrip,
  getMembers,
  getExpenses,
  getSettlement,
  getItinerary,
} from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import type { Balance, Transaction, TripWithMembers } from '@/types';
import { tripKeys } from './keys';
import { fetchWithPublicFallback } from './fetcher';

/**
 * Trip-scoped data hooks backed by TanStack Query.
 *
 * Each query encapsulates the auth + public-share fallback (see
 * {@link fetchWithPublicFallback}) and is keyed via {@link tripKeys} so
 * mutations can invalidate them precisely. Replaces the manual
 * useState + reload() pattern previously duplicated across trip pages.
 */

/** Current logged-in user, or null when not authenticated (never throws). */
export function useCurrentUser() {
  return useQuery({
    queryKey: tripKeys.currentUser,
    queryFn: async (): Promise<AuthUserWithCreatedAt | null> => {
      const res = await getCurrentUser();
      return res.success && res.data ? res.data : null;
    },
    staleTime: 5 * 60_000,
  });
}

/** The current user's trips (authenticated; empty list when logged out). */
export function useTrips() {
  return useQuery({
    queryKey: tripKeys.list,
    queryFn: async (): Promise<TripWithMembers[]> => {
      const res = await getTrips();
      return res.success ? res.data : [];
    },
  });
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: () =>
      fetchWithPublicFallback(tripId, getTrip, { path: '', responseKey: 'trip' }, null),
    enabled: !!tripId,
  });
}

export function useMembers(tripId: string) {
  return useQuery({
    queryKey: tripKeys.members(tripId),
    queryFn: () =>
      fetchWithPublicFallback(tripId, getMembers, { path: 'members', responseKey: 'members' }, []),
    enabled: !!tripId,
  });
}

export function useExpenses(tripId: string) {
  return useQuery({
    queryKey: tripKeys.expenses(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getExpenses,
        { path: 'expenses', responseKey: 'expenses' },
        []
      ),
    enabled: !!tripId,
  });
}

const EMPTY_SETTLEMENT: {
  balances: Balance[];
  transactions: Transaction[];
  totalExpenses: number;
} = { balances: [], transactions: [], totalExpenses: 0 };

export function useSettlement(tripId: string) {
  return useQuery({
    queryKey: tripKeys.settlement(tripId),
    // Settlement's public endpoint returns the body directly (no wrapper key).
    queryFn: () =>
      fetchWithPublicFallback(tripId, getSettlement, { path: 'settlement' }, EMPTY_SETTLEMENT),
    enabled: !!tripId,
  });
}

export function useItinerary(tripId: string) {
  return useQuery({
    queryKey: tripKeys.itinerary(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getItinerary,
        { path: 'itinerary', responseKey: 'itinerary' },
        []
      ),
    enabled: !!tripId,
  });
}

/**
 * Derives membership/role from the current user + members list.
 */
export function useTripMembership(tripId: string) {
  const { data: currentUser } = useCurrentUser();
  const { data: members = [] } = useMembers(tripId);

  const isMember = currentUser != null && members.some((m) => m.id === currentUser.id);
  const isAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  return { currentUser: currentUser ?? null, members, isMember, isAdmin };
}
