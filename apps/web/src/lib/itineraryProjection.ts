import { itinerarySchema } from '@travel-budget/contracts';
import { sortActivities } from '@/lib/itineraryActivities';
import { dateForDayNumber, toDateOnly } from '@/lib/itineraryDayTarget';
import type { ItineraryDay } from '@/types';

export function projectMobileItinerary(
  tripId: string,
  trip: { startDate?: Date | null; endDate?: Date | null },
  days: ItineraryDay[]
) {
  const startDate = toDateOnly(trip.startDate);
  const endDate = toDateOnly(trip.endDate);
  return itinerarySchema.parse({
    tripId,
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
