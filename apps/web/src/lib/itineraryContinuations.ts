import { itineraryContinuations } from '@travel-budget/contracts';
import type { ItineraryDay } from '@/types';

/** Whitelist presentation fields for both member and public reads. */
export function projectItineraryContinuations(days: readonly ItineraryDay[]) {
  return itineraryContinuations(
    days.map((day) => ({
      id: day.id,
      dayNumber: day.day_number,
      activities: day.activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        type: activity.type,
        endDayOffset: activity.end_day_offset,
        endTime: activity.end_time,
      })),
    }))
  );
}
export const activityAnchorId = (dayId: string, activityId: string) =>
  `itinerary-activity-${dayId}-${activityId}`;
