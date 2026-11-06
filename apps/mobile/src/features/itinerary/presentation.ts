import {
  itineraryActivityTiming,
  type ItineraryActivity,
  type ItineraryLocation,
} from '@travel-budget/contracts';
import type { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import type { Messages } from '@/i18n/messages';

export function locationName(location: ItineraryLocation | null, fallback: string, locale: string) {
  return location?.names?.[locale] || location?.name || fallback;
}
export function dayLabel(dayNumber: number, t: Messages) {
  return t.itineraryDay.replace('%d', String(dayNumber));
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

/** date is the source day's date supplied by the API, not the trip start date. */
export function activityTiming(
  activity: Pick<ItineraryActivity, 'time' | 'endTime' | 'endDayOffset'> & {
    type?: ItineraryActivity['type'];
  },
  day: { dayNumber: number | null; date: string | null },
  t: Messages,
  copy: (typeof itineraryPresentationMessages)['en'],
  trip?: { startDate: string | null; endDate: string | null }
) {
  const timing = itineraryActivityTiming({
    startDate: day.date,
    dayNumber: 1,
    time: activity.time,
    endTime: activity.endTime,
    endDayOffset: activity.endDayOffset,
  });
  const start = activity.time || copy.unknown;
  const endTime = activity.endTime || copy.unknown;
  const startDate = day.date ?? (day.dayNumber === null ? '—' : dayLabel(day.dayNumber, t));
  const endDate =
    timing.endDayOffset === null
      ? copy.unconfirmed
      : (timing.endDate ??
        (day.dayNumber === null ? '—' : dayLabel(day.dayNumber + timing.endDayOffset, t)));
  const end =
    timing.endDayOffset === 1
      ? `${copy.nextDay} ${endTime}`
      : timing.endDayOffset !== null && timing.endDayOffset !== 0
        ? `${endDate} ${endTime}`
        : endTime;
  const transport = ['flight', 'ground_transport', 'transport'].includes(activity.type ?? '');
  const finish =
    timing.endDayOffset === null
      ? `${copy.unconfirmed} ${endTime}`
      : `${transport ? copy.arrival : copy.end} ${endDate} ${endTime}`;
  return {
    start,
    end,
    endDate: timing.endDate,
    summary: `${transport ? copy.departure : copy.start} ${startDate} ${start} → ${finish}`,
    showSummary:
      (timing.endDayOffset !== null && timing.endDayOffset !== 0) ||
      timing.needsEndDateConfirmation,
    outsideRange:
      !!timing.endDate &&
      !!trip &&
      ((!!trip.startDate && timing.endDate < trip.startDate) ||
        (!!trip.endDate && timing.endDate > trip.endDate)),
  };
}

export function activityIcon(type: ItineraryActivity['type']) {
  return (
    {
      sightseeing: 'map-pin',
      food: 'utensils',
      flight: 'plane',
      ground_transport: 'train',
      transport: 'train',
      accommodation: 'bed',
      shopping: 'shopping-bag',
      activity: 'sparkles',
      other: 'info',
    } as const
  )[type];
}
