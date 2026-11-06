import { itineraryActivityTiming } from '@travel-budget/contracts';
import type { Activity } from '@/types';

export const ACTIVITY_TIMING_KEYS = [
  'day',
  'nextDay',
  'unknown',
  'unconfirmed',
  'start',
  'end',
  'departure',
  'arrival',
] as const;
export type ActivityTimingLabels = Record<(typeof ACTIVITY_TIMING_KEYS)[number], string>;
export function activityTimingLabels(
  t: (key: string, values?: { n: string }) => string
): ActivityTimingLabels {
  return Object.fromEntries(
    ACTIVITY_TIMING_KEYS.map((key) => [key, key === 'day' ? t(key, { n: '{n}' }) : t(key)])
  ) as ActivityTimingLabels;
}

/** One source for member/public rows, confirmations and exports. Dates are local calendar dates. */
export function activityTimingText(
  activity: Pick<Activity, 'time' | 'end_time' | 'end_day_offset' | 'type'>,
  dayNumber: number,
  date: string | null | undefined,
  labels: ActivityTimingLabels
) {
  const timing = itineraryActivityTiming({
    startDate: date ?? null,
    dayNumber: 1,
    time: activity.time,
    endTime: activity.end_time,
    endDayOffset: activity.end_day_offset,
  });
  const day = (n: number) => labels.day.replace('{n}', String(n));
  const startDate = timing.startDate ?? day(dayNumber);
  const endDate =
    timing.endDayOffset === null
      ? labels.unconfirmed
      : (timing.endDate ?? day(dayNumber + timing.endDayOffset));
  const startTime = activity.time || labels.unknown;
  const endTime = activity.end_time || labels.unknown;
  const end =
    timing.endDayOffset === 1
      ? `${labels.nextDay} ${endTime}`
      : timing.endDayOffset !== null && timing.endDayOffset !== 0
        ? `${endDate} ${endTime}`
        : endTime;
  const transport = ['flight', 'ground_transport', 'transport'].includes(activity.type);
  const finish =
    timing.endDayOffset === null
      ? `${labels.unconfirmed} ${endTime}`
      : `${transport ? labels.arrival : labels.end} ${endDate} ${endTime}`;
  const summary = `${transport ? labels.departure : labels.start} ${startDate} ${startTime} → ${finish}`;
  return {
    start: startTime,
    end,
    summary,
    warning: timing.needsEndDateConfirmation,
    showSummary:
      (timing.endDayOffset !== null && timing.endDayOffset !== 0) ||
      timing.needsEndDateConfirmation,
    endDate: timing.endDate,
  };
}
