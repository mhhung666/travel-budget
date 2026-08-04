import { itineraryImportDraftSchema } from './itineraryImportSchema';
import type {
  ItineraryImportActivity,
  ItineraryImportDraft,
  ItineraryImportWarning,
} from './itineraryImportSchema';

export type ExistingItineraryActivity = Pick<ItineraryImportActivity, 'time' | 'title'>;

export type ExistingItineraryDay = {
  date: string;
  activities: ExistingItineraryActivity[];
};

export type NormalizeItineraryImportContext = {
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  existingDays?: ExistingItineraryDay[];
};

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function duplicateKey(date: string, activity: ExistingItineraryActivity): string {
  return `${date}|${activity.time ?? ''}|${normalizeTitle(activity.title)}`;
}

function warningKey(warning: ItineraryImportWarning): string {
  return `${warning.code}|${warning.dayIndex ?? ''}|${warning.activityIndex ?? ''}`;
}

function addWarning(
  warnings: ItineraryImportWarning[],
  seen: Set<string>,
  warning: ItineraryImportWarning
): void {
  const key = warningKey(warning);
  if (seen.has(key)) return;
  seen.add(key);
  warnings.push(warning);
}

function sortActivities(activities: ItineraryImportActivity[]): ItineraryImportActivity[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((a, b) => {
      if (a.activity.time && b.activity.time) {
        return a.activity.time.localeCompare(b.activity.time) || a.index - b.index;
      }
      if (a.activity.time) return -1;
      if (b.activity.time) return 1;
      return a.index - b.index;
    })
    .map(({ activity }) => activity);
}

/**
 * Apply deterministic rules after model parsing. The function never mutates its input and never
 * invents coordinates or user data. Date warnings remain explicit for the preview UI to resolve.
 */
export function normalizeItineraryImport(
  input: ItineraryImportDraft,
  context: NormalizeItineraryImportContext
): ItineraryImportDraft {
  const parsed = itineraryImportDraftSchema.parse(input);
  const existingByDate = new Map(
    (context.existingDays ?? []).map((day) => [day.date, day.activities] as const)
  );
  const existingKeys = new Set(
    (context.existingDays ?? []).flatMap((day) =>
      day.activities.map((activity) => duplicateKey(day.date, activity))
    )
  );
  const importedKeys = new Set<string>();
  const warnings = parsed.warnings.map((warning) => ({ ...warning }));
  const warningKeys = new Set(warnings.map(warningKey));

  const days = parsed.days.map((sourceDay, dayIndex) => {
    const day = {
      ...sourceDay,
      activities: sortActivities(sourceDay.activities.map((activity) => ({ ...activity }))),
    };

    if (!day.date && day.relativeDay && context.tripStartDate) {
      day.date = addDays(context.tripStartDate, day.relativeDay - 1);
    }

    if (!day.date) {
      addWarning(warnings, warningKeys, {
        code: day.relativeDay ? 'RELATIVE_DATE_UNRESOLVED' : 'MISSING_DATE',
        dayIndex,
      });
      return day;
    }

    if (
      (context.tripStartDate && day.date < context.tripStartDate) ||
      (context.tripEndDate && day.date > context.tripEndDate)
    ) {
      addWarning(warnings, warningKeys, { code: 'DATE_OUTSIDE_TRIP', dayIndex });
    }

    if (existingByDate.has(day.date)) {
      addWarning(warnings, warningKeys, { code: 'EXISTING_DAY_APPEND', dayIndex });
    }

    day.activities.forEach((activity, activityIndex) => {
      if (activity.time && activity.endTime && activity.endTime < activity.time) {
        addWarning(warnings, warningKeys, {
          code: 'END_TIME_BEFORE_START',
          dayIndex,
          activityIndex,
        });
      }

      const key = duplicateKey(day.date!, activity);
      if (existingKeys.has(key) || importedKeys.has(key)) {
        addWarning(warnings, warningKeys, {
          code: 'POSSIBLE_DUPLICATE',
          dayIndex,
          activityIndex,
        });
      }
      importedKeys.add(key);
    });

    return day;
  });

  return itineraryImportDraftSchema.parse({
    ...parsed,
    days,
    warnings,
  });
}
