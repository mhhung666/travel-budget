import { ItineraryDay, Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import type { NormalizeItineraryImportContext } from './normalizeItineraryImport';

type LeanTripDates = {
  startDate?: Date | null;
  endDate?: Date | null;
};

type LeanItineraryDay = {
  dayNumber: number;
  activities?: Array<{ time?: string | null; title: string }>;
};

export type ItineraryImportContextResult =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'ok'; tripId: string; context: NormalizeItineraryImportContext };

function formatDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function addDays(startDate: string, amount: number): string {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Read the minimum trip context needed for deterministic normalization. Never writes data. */
export async function loadItineraryImportContext(
  userId: string,
  tripIdOrCode: string
): Promise<ItineraryImportContextResult> {
  const membership = await getTripMembership(userId, tripIdOrCode);
  if (!membership || membership.role !== 'admin') return { status: 'forbidden' };

  const trip = await Trip.findById(membership.tripId)
    .select('startDate endDate')
    .lean<LeanTripDates | null>();
  if (!trip) return { status: 'not_found' };

  const tripStartDate = formatDate(trip.startDate);
  const tripEndDate = formatDate(trip.endDate);
  const days = await ItineraryDay.find({ trip: membership.tripId })
    .select('dayNumber activities.time activities.title')
    .lean<LeanItineraryDay[]>();

  return {
    status: 'ok',
    tripId: membership.tripId,
    context: {
      tripStartDate,
      tripEndDate,
      existingDays: tripStartDate
        ? days.map((day) => ({
            date: addDays(tripStartDate, day.dayNumber - 1),
            activities: (day.activities ?? []).map((activity) => ({
              time: activity.time ?? undefined,
              title: activity.title,
            })),
          }))
        : [],
    },
  };
}
