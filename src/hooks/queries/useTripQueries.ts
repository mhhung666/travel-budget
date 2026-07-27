'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getCurrentUser,
  getTrips,
  getTrip,
  getMembers,
  getExpenses,
  getSettlement,
  getTripStats,
  getItinerary,
  getChecklists,
  getCopyableChecklists,
} from '@/actions';
import type { AuthUserWithCreatedAt, CopyableChecklistSource } from '@/actions';
import type { Checklist, Settlement, TripStatsData, TripWithMembers } from '@/types';
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

const EMPTY_SETTLEMENT: Settlement = {
  balances: [],
  transactions: [],
  payments: [],
  totalExpenses: 0,
};

export function useSettlement(tripId: string) {
  return useQuery({
    queryKey: tripKeys.settlement(tripId),
    // Settlement's public endpoint returns the body directly (no wrapper key).
    queryFn: () =>
      fetchWithPublicFallback(tripId, getSettlement, { path: 'settlement' }, EMPTY_SETTLEMENT),
    enabled: !!tripId,
  });
}

const EMPTY_TRIP_STATS: TripStatsData = {
  categoryStats: [],
  tagStats: [],
  totalAmount: 0,
  totalExpenses: 0,
  memberSpends: [],
  memberCount: 0,
  dayCount: 0,
  avgPerPersonPerDay: 0,
  dailySpend: [],
};

/**
 * Group (whole-trip) statistics. Shares {@link tripKeys.stats} — already
 * invalidated by expense mutations — so it refetches when expenses change.
 * Public endpoint returns the body directly (no wrapper key), like settlement.
 */
export function useTripStats(tripId: string) {
  return useQuery({
    queryKey: tripKeys.stats(tripId),
    queryFn: () =>
      fetchWithPublicFallback(tripId, getTripStats, { path: 'stats' }, EMPTY_TRIP_STATS),
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

/** Trip checklists (packing / to-do). Read-only via the public share fallback. */
export function useChecklists(tripId: string) {
  return useQuery({
    queryKey: tripKeys.checklists(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getChecklists,
        { path: 'checklists', responseKey: 'checklists' },
        [] as Checklist[]
      ),
    enabled: !!tripId,
  });
}

/**
 * Checklists in the user's other trips that can be copied into this one. Loaded
 * lazily (only when the new-checklist sheet's "copy from trip" tab opens) — pass
 * `enabled` to gate the fetch.
 */
export function useCopyableChecklists(tripId: string, enabled: boolean) {
  return useQuery({
    queryKey: tripKeys.copyableChecklists(tripId),
    queryFn: async (): Promise<CopyableChecklistSource[]> => {
      const res = await getCopyableChecklists(tripId);
      return res.success ? res.data : [];
    },
    enabled: !!tripId && enabled,
    staleTime: 60_000,
  });
}

/**
 * Derives membership/role from the current user + members list.
 */
export function useTripMembership(tripId: string) {
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { data: members = [], isLoading: areMembersLoading } = useMembers(tripId);

  const isMember = currentUser != null && members.some((m) => m.id === currentUser.id);
  const isAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  return {
    currentUser: currentUser ?? null,
    members,
    isMember,
    isAdmin,
    isLoading: isCurrentUserLoading || areMembersLoading,
  };
}
