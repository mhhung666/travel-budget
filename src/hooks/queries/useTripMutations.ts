'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateTrip,
  deleteTrip,
  regenerateHashCode,
  archiveTrip,
  unarchiveTrip,
  setTripBudget,
  setTripCurrencySettings,
} from '@/actions';
import type { ActionResult } from '@/actions';
import type { UpdateTripInput, SetBudgetInput, SetCurrencySettingsInput } from '@/lib/validation';
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
    onSuccess: (trip: Trip, input: UpdateTripInput) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.list });
      if (input.start_date !== undefined || input.end_date !== undefined) {
        queryClient.invalidateQueries({ queryKey: tripKeys.photos(tripId) });
      }
    },
  });

  // Personal budget lives on the caller's embedded trip membership. The detail DTO
  // only carries that viewer's budget; progress is derived from their expense splits.
  const setBudget = useMutation({
    mutationFn: (input: SetBudgetInput) => unwrap(setTripBudget(tripId, input)),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
    },
  });

  // Currency settings live on the trip document (same as budget) — refresh the
  // trip detail query and the consumers (expense form / settlement / stats)
  // derive everything client-side from trip.currency_settings.
  const setCurrencySettings = useMutation({
    mutationFn: (input: SetCurrencySettingsInput) => unwrap(setTripCurrencySettings(tripId, input)),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
    },
  });

  // Regenerating the hash_code invalidates every old share/public link. The
  // caller is responsible for navigating to the new hash_code URL afterwards.
  const regenerate = useMutation({
    mutationFn: () => unwrap(regenerateHashCode(tripId)),
    onSuccess: (trip: Trip) => {
      queryClient.setQueryData(tripKeys.detail(tripId), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
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

  return { update, regenerate, remove, setBudget, setCurrencySettings };
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
