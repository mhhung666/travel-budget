import { readMemberTrips } from '@/lib/tripListRead';
import { getMemberTrip } from '@/lib/permissions';
import { toTripDto, type TripDtoInput } from '@/lib/dto';
import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { readTripListSummaries } from '@/lib/tripListSummary';
import { getTripPhase, dateFromLocalDateKey } from '@/lib/tripStatus';
import type { TripWithMembers } from '@/types';
import { ApiError } from './http';
import { dateSchema, idSchema, tripSchema, landingSchema, type MobileTrip } from './contract';

function mapTrip(trip: TripWithMembers, today: string): MobileTrip {
  const phase = getTripPhase(trip.start_date, trip.end_date, dateFromLocalDateKey(today)!);
  return tripSchema.parse({
    id: trip.id,
    name: trip.name,
    description: trip.description,
    startDate: trip.start_date,
    endDate: trip.end_date,
    destination: trip.destination_location?.name ?? null,
    archived: trip.archived_at !== null,
    memberCount: trip.member_count,
    mySpent: trip.my_spent,
    myBalance: trip.my_balance,
    phase:
      phase.phase === 'postTrip'
        ? 'past'
        : phase.phase === 'ongoing' && trip.end_date
          ? 'ongoing'
          : phase.daysUntil !== null
            ? 'upcoming'
            : 'unscheduled',
  });
}
export function viewerDate(url: URL) {
  const result = dateSchema.safeParse(
    url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  );
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR');
  return result.data;
}
export async function mobileTrips(userId: string, url: URL) {
  const today = viewerDate(url);
  const pageText = url.searchParams.get('page') ?? '1';
  if (!/^[1-9]\d{0,5}$/.test(pageText)) throw new ApiError(400, 'VALIDATION_ERROR');
  const page = Number(pageText);
  // Share the existing member-authorized read and financial summaries with Web.
  // Pagination bounds HTTP payloads; the shared reader still reads the member's full list.
  const trips = (await readMemberTrips(userId)).map((trip) => mapTrip(trip, today));
  const priority = (trip: MobileTrip) =>
    trip.archived ? 4 : { ongoing: 0, upcoming: 1, unscheduled: 2, past: 3 }[trip.phase];
  trips.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (a.phase === 'upcoming' && b.phase === 'upcoming'
        ? (a.startDate ?? '').localeCompare(b.startDate ?? '')
        : 0) ||
      0
  );
  const offset = (page - 1) * 20;
  return {
    items: trips.slice(offset, offset + 20),
    nextPage: offset + 20 < trips.length ? page + 1 : null,
  };
}
export async function mobileLanding(userId: string, id: string, today: string) {
  if (!idSchema.safeParse(id).success) throw new ApiError(404, 'NOT_FOUND');
  const result = await getMemberTrip<TripDtoInput & LeanTripShell>(
    userId,
    id,
    'name description startDate endDate destinationLocation hashCode createdAt currencySettings'
  );
  if (!result) throw new ApiError(404, 'NOT_FOUND');
  const [shell, summaries] = await Promise.all([
    readTripShell(result.trip, userId, today),
    readTripListSummaries([id], userId),
  ]);
  return landingSchema.parse({
    ...mapTrip(
      {
        ...toTripDto(result.trip, userId),
        member_count: shell.member_count,
        my_spent: shell.total_spent,
        my_balance: summaries.get(id)?.myBalance ?? 0,
      },
      today
    ),
    role: result.membership.role,
    expenseCount: shell.expense_count,
    todayGroupSpent: shell.today_spent,
    budgetTotal: shell.budget?.total ?? null,
  });
}
