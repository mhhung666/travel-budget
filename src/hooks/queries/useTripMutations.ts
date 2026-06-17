'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTrip, deleteTrip, regenerateHashCode, archiveTrip, unarchiveTrip } from '@/actions';
import type { ActionResult } from '@/actions';
import type { UpdateTripInput } from '@/lib/validation';
import type { Trip } from '@/types';
import { tripKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * Trip-level mutations. Editing trip details invalidates (and seeds) the trip
 * detail query so the refreshed trip shows without a manual reload.
 */
export function useTripMutations(tripId: string) {
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (input: UpdateTripInput) => unwrap(updateTrip(tripId, input)),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list });
    },
  });

  // Regenerating the hash_code invalidates every old share/public link. The
  // caller is responsible for navigating to the new hash_code URL afterwards.
  const regenerate = useMutation({
    mutationFn: () => unwrap(regenerateHashCode(tripId)),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.list });
    },
  });

  const remove = useMutation({
    mutationFn: () => unwrap(deleteTrip(tripId)),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: tripKeys.all(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list });
    },
  });

  return { update, regenerate, remove };
}

/**
 * Per-member archive/unarchive, keyed by tripId at call time so the trips list
 * (which holds many trips) can toggle any card. Archive is personal — it only
 * moves the trip between the caller's active/archived tabs — so we just refresh
 * the list (and the detail query if it's cached).
 */
export function useTripArchiveMutations() {
  const queryClient = useQueryClient();

  const onSuccess = (trip: Trip) => {
    queryClient.setQueryData(tripKeys.detail(trip.id), trip);
    queryClient.setQueryData(tripKeys.detail(trip.hash_code), trip);
    queryClient.invalidateQueries({ queryKey: tripKeys.list });
  };

  const archive = useMutation({
    mutationFn: (tripId: string) => unwrap(archiveTrip(tripId)),
    onSuccess,
  });

  const unarchive = useMutation({
    mutationFn: (tripId: string) => unwrap(unarchiveTrip(tripId)),
    onSuccess,
  });

  return { archive, unarchive };
}
