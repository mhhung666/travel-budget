import type { ItineraryActivity, ItineraryLocation } from '@travel-budget/contracts';
import type { Messages } from '@/i18n/messages';

export function locationName(location: ItineraryLocation | null, fallback: string, locale: string) {
  return location?.names?.[locale] || location?.name || fallback;
}
export function dayLabel(dayNumber: number, t: Messages) {
  return t.itineraryDay.replace('%d', String(dayNumber));
}
export function activityTime(activity: Pick<ItineraryActivity, 'time' | 'endTime'>, t: Messages) {
  if (activity.time && activity.endTime) return `${activity.time}–${activity.endTime}`;
  // Legacy activities may carry only an end time; keep it visible without inventing a start.
  if (activity.endTime) return `${t.itineraryUntimed}–${activity.endTime}`;
  return activity.time ?? t.itineraryUntimed;
}
export function activityType(type: ItineraryActivity['type'], t: Messages) {
  return {
    sightseeing: t.itinerarySightseeing,
    food: t.itineraryFood,
    flight: t.itineraryFlight,
    ground_transport: t.itineraryGround,
    transport: t.itineraryTransport,
    accommodation: t.itineraryStay,
    shopping: t.itineraryShopping,
    activity: t.itineraryActivity,
    other: t.itineraryOther,
  }[type];
}
