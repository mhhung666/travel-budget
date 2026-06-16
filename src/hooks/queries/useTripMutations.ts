'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateTrip } from '@/actions';
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
    },
  });

  return { update };
}
