import { ITINERARY_IMPORT_LIMITS } from './importLimits';
import {
  ITINERARY_IMPORT_ACTIVITY_TYPES,
  itineraryImportDraftSchema,
  type ItineraryImportActivity,
  type ItineraryImportDraft,
  type ItineraryImportWarning,
} from './itineraryImportSchema';

export type ItineraryImportPreviewActivity = {
  id: string;
  included: boolean;
  time: string;
  endTime: string;
  title: string;
  type: ItineraryImportActivity['type'];
  locationName: string;
  note: string;
  confirmationCode: string;
};

export type ItineraryImportPreviewDay = {
  id: string;
  included: boolean;
  sourceDate: string;
  date: string;
  relativeDay?: number;
  title: string;
  content: string;
  activities: ItineraryImportPreviewActivity[];
};

export type ItineraryImportPreview = {
  sourceSummary: string;
  days: ItineraryImportPreviewDay[];
  warnings: ItineraryImportWarning[];
};

export type ItineraryImportPreviewIssueCode =
  | 'NO_SELECTION'
  | 'MISSING_DATE'
  | 'INVALID_DATE'
  | 'DATE_OUTSIDE_TRIP'
  | 'MISSING_DAY_TITLE'
  | 'DAY_TITLE_TOO_LONG'
  | 'DAY_CONTENT_TOO_LONG'
  | 'MISSING_ACTIVITY_TITLE'
  | 'ACTIVITY_TITLE_TOO_LONG'
  | 'INVALID_TIME'
  | 'END_TIME_BEFORE_START'
  | 'LOCATION_TOO_LONG'
  | 'NOTE_TOO_LONG'
  | 'CONFIRMATION_CODE_TOO_LONG';

export type ItineraryImportPreviewIssue = {
  code: ItineraryImportPreviewIssueCode;
  dayIndex?: number;
  activityIndex?: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function warningForDay(
  preview: ItineraryImportPreview,
  code: ItineraryImportWarning['code'],
  dayIndex: number
): boolean {
  return preview.warnings.some((warning) => warning.code === code && warning.dayIndex === dayIndex);
}

export function createItineraryImportPreview(draft: ItineraryImportDraft): ItineraryImportPreview {
  const parsed = itineraryImportDraftSchema.parse(draft);
  return {
    sourceSummary: parsed.sourceSummary,
    warnings: parsed.warnings.map((warning) => ({ ...warning })),
    days: parsed.days.map((day, dayIndex) => ({
      id: `day-${dayIndex}`,
      included: !parsed.warnings.some(
        (warning) => warning.code === 'DATE_OUTSIDE_TRIP' && warning.dayIndex === dayIndex
      ),
      sourceDate: day.date ?? '',
      date: day.date ?? '',
      relativeDay: day.relativeDay,
      title: day.title ?? '',
      content: day.content ?? '',
      activities: day.activities.map((activity, activityIndex) => ({
        id: `activity-${dayIndex}-${activityIndex}`,
        included: true,
        time: activity.time ?? '',
        endTime: activity.endTime ?? '',
        title: activity.title,
        type: activity.type,
        locationName: activity.locationName ?? '',
        note: activity.note ?? '',
        confirmationCode: activity.confirmationCode ?? '',
      })),
    })),
  };
}

export function validateItineraryImportPreview(
  preview: ItineraryImportPreview,
  tripDates: { startDate?: string | null; endDate?: string | null } = {}
): ItineraryImportPreviewIssue[] {
  const issues: ItineraryImportPreviewIssue[] = [];
  const selectedDays = preview.days.filter((day) => day.included);
  if (selectedDays.length === 0) return [{ code: 'NO_SELECTION' }];

  preview.days.forEach((day, dayIndex) => {
    if (!day.included) return;

    if (!day.date) issues.push({ code: 'MISSING_DATE', dayIndex });
    else if (!isCalendarDate(day.date)) issues.push({ code: 'INVALID_DATE', dayIndex });
    else if (
      (tripDates.startDate && day.date < tripDates.startDate) ||
      (tripDates.endDate && day.date > tripDates.endDate)
    ) {
      issues.push({ code: 'DATE_OUTSIDE_TRIP', dayIndex });
    }

    const appendsToExistingDay = warningForDay(preview, 'EXISTING_DAY_APPEND', dayIndex);
    if (!appendsToExistingDay && !day.title.trim()) {
      issues.push({ code: 'MISSING_DAY_TITLE', dayIndex });
    } else if (day.title.trim().length > ITINERARY_IMPORT_LIMITS.dayTitleCharacters) {
      issues.push({ code: 'DAY_TITLE_TOO_LONG', dayIndex });
    }
    if (day.content.length > ITINERARY_IMPORT_LIMITS.dayContentCharacters) {
      issues.push({ code: 'DAY_CONTENT_TOO_LONG', dayIndex });
    }

    day.activities.forEach((activity, activityIndex) => {
      if (!activity.included) return;
      if (!activity.title.trim()) {
        issues.push({ code: 'MISSING_ACTIVITY_TITLE', dayIndex, activityIndex });
      } else if (activity.title.trim().length > ITINERARY_IMPORT_LIMITS.activityTitleCharacters) {
        issues.push({ code: 'ACTIVITY_TITLE_TOO_LONG', dayIndex, activityIndex });
      }
      if (activity.time && !TIME_PATTERN.test(activity.time)) {
        issues.push({ code: 'INVALID_TIME', dayIndex, activityIndex });
      }
      if (activity.endTime && !TIME_PATTERN.test(activity.endTime)) {
        issues.push({ code: 'INVALID_TIME', dayIndex, activityIndex });
      }
      if (
        activity.time &&
        activity.endTime &&
        TIME_PATTERN.test(activity.time) &&
        TIME_PATTERN.test(activity.endTime) &&
        activity.endTime < activity.time
      ) {
        issues.push({ code: 'END_TIME_BEFORE_START', dayIndex, activityIndex });
      }
      if (activity.locationName.trim().length > ITINERARY_IMPORT_LIMITS.locationNameCharacters) {
        issues.push({ code: 'LOCATION_TOO_LONG', dayIndex, activityIndex });
      }
      if (activity.note.trim().length > ITINERARY_IMPORT_LIMITS.activityNoteCharacters) {
        issues.push({ code: 'NOTE_TOO_LONG', dayIndex, activityIndex });
      }
      if (
        activity.confirmationCode.trim().length > ITINERARY_IMPORT_LIMITS.confirmationCodeCharacters
      ) {
        issues.push({ code: 'CONFIRMATION_CODE_TOO_LONG', dayIndex, activityIndex });
      }
    });
  });

  return issues;
}

/** Convert the currently selected and edited rows back to the canonical server draft contract. */
export function toItineraryImportDraft(
  preview: ItineraryImportPreview
): ItineraryImportDraft | null {
  const includedDayIndexes = new Map<number, number>();
  const includedActivityIndexes = new Map<number, Map<number, number>>();
  const days = preview.days.flatMap((day, dayIndex) => {
    if (!day.included) return [];
    includedDayIndexes.set(dayIndex, includedDayIndexes.size);
    const activityIndexes = new Map<number, number>();
    includedActivityIndexes.set(dayIndex, activityIndexes);
    return [
      {
        ...(day.date ? { date: day.date } : {}),
        ...(day.relativeDay ? { relativeDay: day.relativeDay } : {}),
        ...(day.title.trim() ? { title: day.title.trim() } : {}),
        ...(day.content.trim() ? { content: day.content.trim() } : {}),
        activities: day.activities.flatMap((activity, activityIndex) => {
          if (!activity.included) return [];
          activityIndexes.set(activityIndex, activityIndexes.size);
          return [
            {
              ...(activity.time ? { time: activity.time } : {}),
              ...(activity.endTime ? { endTime: activity.endTime } : {}),
              title: activity.title.trim(),
              type: activity.type,
              ...(activity.locationName.trim()
                ? { locationName: activity.locationName.trim() }
                : {}),
              ...(activity.note.trim() ? { note: activity.note.trim() } : {}),
              ...(activity.confirmationCode.trim()
                ? { confirmationCode: activity.confirmationCode.trim() }
                : {}),
            },
          ];
        }),
      },
    ];
  });

  const resolvedWarningCodes = new Set<ItineraryImportWarning['code']>([
    'MISSING_DATE',
    'AMBIGUOUS_DATE',
    'DATE_OUTSIDE_TRIP',
    'RELATIVE_DATE_UNRESOLVED',
    'END_TIME_BEFORE_START',
  ]);
  const warnings = preview.warnings.flatMap((warning) => {
    if (resolvedWarningCodes.has(warning.code)) return [];
    if (warning.dayIndex === undefined) return [warning];
    const nextDayIndex = includedDayIndexes.get(warning.dayIndex);
    if (nextDayIndex === undefined) return [];
    if (warning.activityIndex === undefined) return [{ ...warning, dayIndex: nextDayIndex }];
    const nextActivityIndex = includedActivityIndexes
      .get(warning.dayIndex)
      ?.get(warning.activityIndex);
    if (nextActivityIndex === undefined) return [];
    return [
      {
        ...warning,
        dayIndex: nextDayIndex,
        activityIndex: nextActivityIndex,
      },
    ];
  });

  const result = itineraryImportDraftSchema.safeParse({
    sourceSummary: preview.sourceSummary,
    days,
    warnings,
  });
  return result.success ? result.data : null;
}

export function isItineraryImportActivityType(
  value: string
): value is ItineraryImportActivity['type'] {
  return ITINERARY_IMPORT_ACTIVITY_TYPES.some((type) => type === value);
}
