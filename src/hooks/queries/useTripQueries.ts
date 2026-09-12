'use client';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { TripLanding } from '@/types/tripLanding';

import { useMutationState, useQuery } from '@tanstack/react-query';
import {
  expenseCreateMutationKey,
  type CreateExpenseVars,
  type ExpenseCreateContext,
} from '@/lib/offlineMutations';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';
import {
  getCurrentUser,
  getTrips,
  getTrip,
  getTripShell,
  getMembers,
  getExpenses,
  getExpenseTags,
  getSettlement,
  getTripStats,
  getItinerary,
  getChecklists,
  getCopyableChecklists,
} from '@/actions';
import type { AuthUserWithCreatedAt, CopyableChecklistSource } from '@/actions';
import type { Checklist, Settlement, TripShell, TripStatsData, TripWithMembers } from '@/types';
import { useLandingRead } from './useLandingRead';
import { tripKeys } from './keys';
import { fetchWithPublicFallback } from './fetcher';
import { useAuthenticatedSession } from '@/components/providers/QueryProvider';
import { combineReadStates } from '@/lib/queryReadState';
import { unwrapActionResult } from '@/lib/actionQuery';

/**
 * Trip-scoped data hooks backed by TanStack Query.
 *
 * Each query encapsulates the auth + public-share fallback (see
 * {@link fetchWithPublicFallback}) and is keyed via {@link tripKeys} so
 * mutations can invalidate them precisely. Replaces the manual
 * useState + reload() pattern previously duplicated across trip pages.
 */

/** Current logged-in user, or null when not authenticated (only successful auth-null means unauthenticated). */
export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: tripKeys.currentUser,
    queryFn: async (): Promise<AuthUserWithCreatedAt | null> => {
      const res = await getCurrentUser();
      return unwrapActionResult(res);
    },
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** The current user's trips. Failures must not masquerade as an empty list. */
export function useTrips(enabled = true) {
  return useQuery({
    queryKey: tripKeys.list,
    queryFn: async (): Promise<TripWithMembers[]> => {
      const res = await getTrips();
      return unwrapActionResult(res);
    },
    enabled,
  });
}

export function useTrip(tripId: string) {
  const landing = useLandingRead(tripId);
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.detail(tripId),
    queryFn: () =>
      landing('trip', () =>
        fetchWithPublicFallback(
          tripId,
          getTrip,
          { path: '', responseKey: 'trip' },
          null as unknown as TripLanding['trip'],
          authenticated
        )
      ),
    enabled: !!tripId,
  });
}

export function useTripShell(tripId: string) {
  const landing = useLandingRead(tripId);
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.shell(tripId),
    queryFn: () => {
      const today = new Date();
      const viewerDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-');
      return landing('shell', () =>
        fetchWithPublicFallback(
          tripId,
          (id) => getTripShell(id, viewerDate),
          { path: 'shell', responseKey: 'shell' },
          null as unknown as TripShell,
          authenticated
        )
      );
    },
    enabled: !!tripId,
  });
}

export function useMembers(tripId: string, enabled = true) {
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.members(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getMembers,
        { path: 'members', responseKey: 'members' },
        [],
        authenticated
      ),
    enabled: !!tripId && enabled,
  });
}

export function useExpenses(tripId: string, enabled = true) {
  const authenticated = useAuthenticatedSession();
  const query = useQuery({
    queryKey: tripKeys.expenses(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getExpenses,
        { path: 'expenses', responseKey: 'expenses' },
        [],
        authenticated
      ),
    enabled: !!tripId && enabled,
  });
  const pending = useMutationState({
    filters: { mutationKey: expenseCreateMutationKey, status: 'pending' },
    select: (mutation) => ({
      vars: mutation.state.variables as CreateExpenseVars,
      context: mutation.state.context as ExpenseCreateContext | undefined,
      submittedAt: mutation.state.submittedAt,
    }),
  });
  const optimistic = pending
    .filter((entry) => entry.vars?.tripId === tripId && entry.context)
    .map(
      (entry) =>
        query.data?.find((expense) => expense.id === entry.context!.optimisticId) ??
        buildOptimisticExpense(entry.vars.input, {
          tripId,
          id: entry.context!.optimisticId,
          members: [],
          createdAt: new Date(entry.submittedAt).toISOString(),
        })
    );
  const ids = new Set(optimistic.map((expense) => expense.id));
  return {
    ...query,
    data:
      query.data === undefined && !optimistic.length
        ? undefined
        : [...optimistic, ...(query.data ?? []).filter((expense) => !ids.has(expense.id))],
  };
}

/** Distinct tags used by the add/edit form; never downloads expense rows. */
export function useExpenseTags(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripKeys.expenseTags(tripId),
    queryFn: async (): Promise<string[]> => {
      const res = await getExpenseTags(tripId);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: !!tripId && enabled,
    staleTime: 60_000,
  });
}

const EMPTY_SETTLEMENT: Settlement = {
  balances: [],
  transactions: [],
  payments: [],
  totalExpenses: 0,
};

export function useSettlement(tripId: string, enabled = true) {
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.settlement(tripId),
    // Settlement's public endpoint returns the body directly (no wrapper key).
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getSettlement,
        { path: 'settlement' },
        EMPTY_SETTLEMENT,
        authenticated
      ),
    enabled: !!tripId && enabled,
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
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.stats(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getTripStats,
        { path: 'stats' },
        EMPTY_TRIP_STATS,
        authenticated
      ),
    enabled: !!tripId,
  });
}

export function useItinerary(tripId: string, enabled = true) {
  const landing = useLandingRead(tripId);
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.itinerary(tripId),
    queryFn: () =>
      landing('itinerary', () =>
        fetchWithPublicFallback(
          tripId,
          getItinerary,
          { path: 'itinerary', responseKey: 'itinerary' },
          [],
          authenticated
        )
      ),
    enabled: !!tripId && enabled,
  });
}

/** Trip checklists (packing / to-do). Read-only via the public share fallback. */
export function useChecklists(tripId: string, enabled = true) {
  const authenticated = useAuthenticatedSession();
  return useQuery({
    queryKey: tripKeys.checklists(tripId),
    queryFn: () =>
      fetchWithPublicFallback(
        tripId,
        getChecklists,
        { path: 'checklists', responseKey: 'checklists' },
        [] as Checklist[],
        authenticated
      ),
    enabled: !!tripId && enabled,
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
      return unwrapActionResult(res);
    },
    enabled: !!tripId && enabled,
    staleTime: 60_000,
  });
}

/**
 * Derives membership/role from the current user + members list.
 */
export function useTripMembership(tripId: string) {
  const online = useOnlineStatus();
  const userQuery = useCurrentUser();
  const membersQuery = useMembers(tripId);
  const { data: currentUser } = userQuery;
  const { data: members = [] } = membersQuery;
  const query = combineReadStates([userQuery, membersQuery]);

  const isMember =
    (!online || !query.isError) &&
    currentUser != null &&
    members.some((m) => m.id === currentUser.id);
  const isAdmin = isMember && members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  return {
    currentUser: currentUser ?? null,
    members,
    isMember,
    isAdmin,
    isLoading: query.isLoading,
    query,
    isResolved: query.data !== undefined && (!online || !query.isError),
  };
}
