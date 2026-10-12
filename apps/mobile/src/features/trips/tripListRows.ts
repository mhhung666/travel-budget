import type { Trip } from '@/api/contracts';
import type { TripListMetadata } from '@travel-budget/contracts';

export function visibleTripRows(items: Trip[], allowed: (id: string) => boolean) {
  return [...new Map(items.map((trip) => [trip.id, trip])).values()].filter((trip) =>
    allowed(trip.id)
  );
}
export function tripGroup(trip: Trip): string {
  if (!trip.archived && (trip.phase === 'ongoing' || trip.phase === 'upcoming')) return 'current';
  return trip.startDate?.slice(0, 4) ?? 'no-date';
}
export function groupHeading(trips: Trip[], index: number) {
  const group = tripGroup(trips[index]);
  return index === 0 || tripGroup(trips[index - 1]) !== group ? group : null;
}
/** Known denials may have no row on this page; full counts cannot be trusted until refreshed. */
export function usableTripCounts(metadata: TripListMetadata | undefined, trusted: boolean) {
  return trusted ? metadata?.counts : undefined;
}
