import mongoose from 'mongoose';
import { authorizeLedger, ledgerOutput, ledgerOf, validateLedgerChildren } from '@/lib/ledger';
import { readMemberTrips } from '@/lib/tripListRead';
import { rankTripList } from '@/lib/tripListOrder';
import { decideQuickAddTrip } from '@/lib/quickAdd';
import { tripListQuerySchema } from '@travel-budget/contracts';
import { getMemberTrip } from '@/lib/permissions';
import { toTripDto, type TripDtoInput } from '@/lib/dto';
import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { readTripListSummaries } from '@/lib/tripListSummary';
import { getTripPhase, dateFromLocalDateKey, ongoingDayNumber } from '@/lib/tripStatus';
import type { TripWithMembers } from '@/types';
import { ApiError } from './http';
import { dateSchema, idSchema, tripSchema, landingSchema, type MobileTrip } from './contract';

function mapTrip(trip: TripWithMembers, today: string): MobileTrip {
  const phase = getTripPhase(trip.start_date, trip.end_date, dateFromLocalDateKey(today)!);
  const dto = tripSchema.parse({
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
  return ledgerOutput(
    dto,
    (trip as TripWithMembers & { ledger: ReturnType<typeof ledgerOf> }).ledger
  );
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
  const raw: Record<string, string> = {};
  for (const key of ['page', 'date', 'archive', 'sort', 'preferred_trip_id']) {
    const values = url.searchParams.getAll(key);
    if (values.length > 1) throw new ApiError(400, 'VALIDATION_ERROR');
    if (values.length) raw[key] = values[0];
  }
  const parsed = tripListQuerySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR');
  const { archive, sort, preferred_trip_id: preferredTripId } = parsed.data;
  const page = Number(parsed.data.page);
  // One authorized full reader, fixed batch validation/summaries. Not a DB cursor or snapshot.
  const all = await readMemberTrips(userId);
  const now = dateFromLocalDateKey(today)!;
  const decision = decideQuickAddTrip(all, now, preferredTripId);
  const candidates = decision.trips;
  const counts = {
    unarchived: all.filter((trip) => trip.archived_at == null).length,
    archived: all.filter((trip) => trip.archived_at != null).length,
  };
  const selected = all.filter(
    (trip) => archive === 'all' || (trip.archived_at != null) === (archive === 'archived')
  );
  const ordered =
    sort === 'quick-add' ? candidates : sort === 'list' ? rankTripList(selected, now) : selected;
  const trips = ordered.map((trip) => mapTrip(trip, today));
  const priority = (trip: MobileTrip) =>
    trip.archived ? 4 : { ongoing: 0, upcoming: 1, unscheduled: 2, past: 3 }[trip.phase];
  if (sort === 'legacy')
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
    metadata: {
      ...(preferredTripId ? { preferredTripId } : {}),
      archive,
      sort,
      date: today,
      counts,
      quickAdd: {
        candidateCount: candidates.length,
        ongoingCount: candidates.filter(
          (trip) => ongoingDayNumber(trip.start_date, trip.end_date, now) !== null
        ).length,
        directTripId: decision.kind === 'direct' ? decision.trip.id : null,
      },
    },
  };
}
export async function mobileLanding(userId: string, id: string, today: string) {
  if (!idSchema.safeParse(id).success) throw new ApiError(404, 'NOT_FOUND');
  const result = await getMemberTrip<TripDtoInput & LeanTripShell>(
    userId,
    id,
    'name description startDate endDate destinationLocation hashCode createdAt currencySettings baseCurrency'
  );
  if (!result) throw new ApiError(404, 'NOT_FOUND');
  const ledger = authorizeLedger(result.trip as TripDtoInput & { baseCurrency?: string });
  await validateLedgerChildren(mongoose.connection.db!, {
    ...result.trip,
    _id: new mongoose.mongo.ObjectId(id),
  });
  const [shell, summaries] = await Promise.all([
    readTripShell(result.trip, userId, today),
    readTripListSummaries([id], userId),
  ]);
  return landingSchema.parse({
    ...mapTrip(
      {
        ...toTripDto(result.trip, userId),
        ledger,
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
