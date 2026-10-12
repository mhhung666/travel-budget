import type { TripListMetadata } from '@travel-budget/contracts';
import type { Trip } from '@/api/contracts';
import type { DraftTrip } from '@/storage/draftTrips';
import { visibleTripRows } from '@/features/trips/tripListRows';

export interface TripCandidate {
  id: string;
  name: string;
  trip?: Trip;
  localGroup?: 'general' | 'archived' | 'unknown';
}
/** Preserve the server's quick-add order; no financial-page fetch or local uniqueness guess. */
export function onlineCandidates(items: Trip[], allowed: (id: string) => boolean): TripCandidate[] {
  return visibleTripRows(items, allowed)
    .filter((trip) => !trip.archived)
    .map((trip) => ({ id: trip.id, name: trip.name, trip }));
}
export function localCandidates(
  trips: DraftTrip[],
  allowed: (id: string) => boolean,
  fallbackName: string
): TripCandidate[] {
  const groups = ['general', 'archived', 'unknown'] as const;
  return groups.flatMap((group) =>
    trips
      .filter(
        (trip) =>
          !!trip.options &&
          allowed(trip.tripId) &&
          (trip.archived === false
            ? 'general'
            : trip.archived === true
              ? 'archived'
              : 'unknown') === group
      )
      .map((trip) => ({ id: trip.tripId, name: trip.name ?? fallbackName, localGroup: group }))
  );
}

/** Metadata is full-account authorization, never the length of the displayed page. */
export function directCandidate(metadata: TripListMetadata | undefined, rows: TripCandidate[]) {
  const quick = metadata?.quickAdd;
  if (
    !quick ||
    !quick.directTripId ||
    !(quick.ongoingCount === 1 || (quick.ongoingCount === 0 && quick.candidateCount === 1))
  )
    return null;
  const row = rows.find((item) => item.id === quick.directTripId);
  return row && row.trip && !row.trip.archived ? row.id : null;
}
