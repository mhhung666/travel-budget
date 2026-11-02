import { itinerarySchema, idSchema } from '@travel-budget/contracts';
import { getMemberTrip } from '@/lib/permissions';
import { readItinerary } from '@/lib/itineraryRead';
import { sortActivities } from '@/lib/itineraryActivities';
import { dateForDayNumber, toDateOnly } from '@/lib/itineraryDayTarget';
import { ApiError } from './http';

type TripDates = {
  _id: { toString(): string };
  members: { user: { toString(): string }; role?: 'admin' | 'member' | null }[];
  startDate?: Date | null;
  endDate?: Date | null;
};

/** Same reader/order/date rules as Web, with an explicit native read-only projection. */
export async function mobileItinerary(actorId: string, tripId: string) {
  if (!idSchema.safeParse(tripId).success) throw new ApiError(404, 'NOT_FOUND');
  const member = await getMemberTrip<TripDates>(actorId, tripId, '_id startDate endDate');
  if (!member) throw new ApiError(404, 'NOT_FOUND');
  const startDate = toDateOnly(member.trip.startDate);
  const endDate = toDateOnly(member.trip.endDate);
  const days = await readItinerary(member.membership.tripId, true);
  return itinerarySchema.parse({
    tripId: member.membership.tripId,
    startDate,
    endDate,
    days: days.map((day) => {
      const date = startDate ? dateForDayNumber(startDate, day.day_number) : null;
      return {
        id: day.id,
        dayNumber: day.day_number,
        date,
        outsideTripRange: !!date && !!endDate && date > endDate,
        title: day.title,
        content: day.content,
        location: day.location,
        activities: sortActivities(day.activities).map((activity) => ({
          id: activity.id,
          title: activity.title,
          type: activity.type,
          time: activity.time,
          endTime: activity.end_time,
          location: activity.location,
          locationName: activity.location_name ?? '',
          note: activity.note,
          confirmationCode: activity.confirmation_code,
        })),
      };
    }),
  });
}
