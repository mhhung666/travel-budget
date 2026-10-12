import type { TripWithMembers } from '@/types';
import { getTripCardStatus } from './tripStatus';

/** Stable across equal dates and database return order. */
export function compareTripIdentity(a: TripWithMembers, b: TripWithMembers): number {
  return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

/** Web grouping and native pagination use the same calendar-day and archive rules. */
export function rankTripList(trips: TripWithMembers[], now: Date): TripWithMembers[] {
  const priority = (trip: TripWithMembers) => {
    const status = getTripCardStatus(trip, now);
    return status.kind === 'ongoing' ? 0 : status.kind === 'upcoming' ? 1 : 2;
  };
  return trips
    .map((trip) => ({ trip, rank: priority(trip) }))
    .sort(({ trip: a, rank: ap }, { trip: b, rank: bp }) => {
      if (ap !== bp) return ap - bp;
      if (ap === 1)
        return (a.start_date ?? '').localeCompare(b.start_date ?? '') || compareTripIdentity(a, b);
      // ISO date-only strings order by departure year/date; missing departure is last.
      if (!!a.start_date !== !!b.start_date) return a.start_date ? -1 : 1;
      return (b.start_date ?? '').localeCompare(a.start_date ?? '') || compareTripIdentity(a, b);
    })
    .map(({ trip }) => trip);
}
