'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createItineraryDay, updateItineraryDay, deleteItineraryDay } from '@/actions';
import type { ActionResult } from '@/actions';
import { tripKeys } from './keys';

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

interface DayInput {
  title: string;
  content: string;
}

/**
 * Itinerary create/update/delete mutations for a trip.
 * Each invalidates the trip's itinerary query on success, triggering a
 * background refetch (replacing the manual reload() call).
 */
export function useItineraryMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });

  const create = useMutation({
    mutationFn: (data: DayInput) => unwrap(createItineraryDay(tripId, data)),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: DayInput }) =>
      unwrap(updateItineraryDay(tripId, dayId, data)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (dayId: string) => unwrap(deleteItineraryDay(tripId, dayId)),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
