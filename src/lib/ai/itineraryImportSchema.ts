import { z } from 'zod';
import { locales } from '@/i18n/routing';
import { ITINERARY_IMPORT_LIMITS, isItineraryImportSourceWithinLimit } from './importLimits';

export const ITINERARY_IMPORT_ACTIVITY_TYPES = [
  'sightseeing',
  'food',
  'flight',
  'ground_transport',
  'accommodation',
  'shopping',
  'activity',
  'other',
] as const;

export const ITINERARY_IMPORT_WARNING_CODES = [
  'MISSING_DATE',
  'AMBIGUOUS_DATE',
  'DATE_OUTSIDE_TRIP',
  'RELATIVE_DATE_UNRESOLVED',
  'EXISTING_DAY_APPEND',
  'POSSIBLE_DUPLICATE',
  'END_TIME_BEFORE_START',
  'UNRECOGNIZED_CONTENT',
] as const;

export const ITINERARY_IMPORT_ERROR_CODES = [
  'UNAUTHENTICATED',
  'TRIP_NOT_FOUND',
  'FORBIDDEN',
  'FEATURE_DISABLED',
  'INVALID_REQUEST',
  'SOURCE_TOO_LONG',
  'USAGE_LIMITED',
  'RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'INVALID_MODEL_OUTPUT',
  'MODEL_OUTPUT_LIMIT',
  'INTERNAL_ERROR',
] as const;

export const itineraryImportWarningCodeSchema = z.enum(ITINERARY_IMPORT_WARNING_CODES);
export const itineraryImportErrorCodeSchema = z.enum(ITINERARY_IMPORT_ERROR_CODES);

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需為 YYYY-MM-DD')
  .refine(isCalendarDate, '日期不存在');

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時間格式需為 HH:mm');

export const itineraryImportActivitySchema = z
  .object({
    time: timeSchema.optional(),
    endTime: timeSchema.optional(),
    title: z.string().trim().min(1).max(ITINERARY_IMPORT_LIMITS.activityTitleCharacters),
    type: z.enum(ITINERARY_IMPORT_ACTIVITY_TYPES),
    locationName: z
      .string()
      .trim()
      .min(1)
      .max(ITINERARY_IMPORT_LIMITS.locationNameCharacters)
      .optional(),
    note: z.string().trim().max(ITINERARY_IMPORT_LIMITS.activityNoteCharacters).optional(),
    confirmationCode: z
      .string()
      .trim()
      .min(1)
      .max(ITINERARY_IMPORT_LIMITS.confirmationCodeCharacters)
      .optional(),
  })
  .strict();

export const itineraryImportDaySchema = z
  .object({
    date: calendarDateSchema.optional(),
    relativeDay: z.number().int().positive().max(366).optional(),
    title: z.string().trim().min(1).max(ITINERARY_IMPORT_LIMITS.dayTitleCharacters).optional(),
    content: z.string().trim().max(ITINERARY_IMPORT_LIMITS.dayContentCharacters).optional(),
    activities: z
      .array(itineraryImportActivitySchema)
      .max(ITINERARY_IMPORT_LIMITS.activitiesPerDay),
  })
  .strict();

export const itineraryImportWarningSchema = z
  .object({
    code: itineraryImportWarningCodeSchema,
    message: z
      .string()
      .trim()
      .min(1)
      .max(ITINERARY_IMPORT_LIMITS.warningMessageCharacters)
      .optional(),
    dayIndex: z.number().int().nonnegative().optional(),
    activityIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export const itineraryImportDraftSchema = z
  .object({
    sourceSummary: z
      .string()
      .trim()
      .max(ITINERARY_IMPORT_LIMITS.sourceSummaryCharacters)
      .default(''),
    days: z.array(itineraryImportDaySchema).max(ITINERARY_IMPORT_LIMITS.days),
    warnings: z
      .array(itineraryImportWarningSchema)
      .max(ITINERARY_IMPORT_LIMITS.warnings)
      .default([]),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const totalActivities = draft.days.reduce((sum, day) => sum + day.activities.length, 0);
    if (totalActivities > ITINERARY_IMPORT_LIMITS.totalActivities) {
      ctx.addIssue({
        code: 'too_big',
        maximum: ITINERARY_IMPORT_LIMITS.totalActivities,
        origin: 'array',
        inclusive: true,
        path: ['days'],
        message: `活動總數不可超過 ${ITINERARY_IMPORT_LIMITS.totalActivities}`,
      });
    }
  });

// OpenAI strict structured outputs require every declared property to be required. Fields that are
// optional in our application contract are therefore represented as required-but-nullable at the
// provider boundary, then converted back before the canonical draft schema is applied.
export const openAIItineraryImportDraftSchema = z
  .object({
    sourceSummary: z.string().trim().max(ITINERARY_IMPORT_LIMITS.sourceSummaryCharacters),
    days: z
      .array(
        z
          .object({
            date: calendarDateSchema.nullable(),
            relativeDay: z.number().int().positive().max(366).nullable(),
            title: z
              .string()
              .trim()
              .min(1)
              .max(ITINERARY_IMPORT_LIMITS.dayTitleCharacters)
              .nullable(),
            content: z.string().trim().max(ITINERARY_IMPORT_LIMITS.dayContentCharacters).nullable(),
            activities: z
              .array(
                z
                  .object({
                    time: timeSchema.nullable(),
                    endTime: timeSchema.nullable(),
                    title: z
                      .string()
                      .trim()
                      .min(1)
                      .max(ITINERARY_IMPORT_LIMITS.activityTitleCharacters),
                    type: z.enum(ITINERARY_IMPORT_ACTIVITY_TYPES),
                    locationName: z
                      .string()
                      .trim()
                      .min(1)
                      .max(ITINERARY_IMPORT_LIMITS.locationNameCharacters)
                      .nullable(),
                    note: z
                      .string()
                      .trim()
                      .max(ITINERARY_IMPORT_LIMITS.activityNoteCharacters)
                      .nullable(),
                    confirmationCode: z
                      .string()
                      .trim()
                      .min(1)
                      .max(ITINERARY_IMPORT_LIMITS.confirmationCodeCharacters)
                      .nullable(),
                  })
                  .strict()
              )
              .max(ITINERARY_IMPORT_LIMITS.activitiesPerDay),
          })
          .strict()
      )
      .max(ITINERARY_IMPORT_LIMITS.days),
    warnings: z
      .array(
        z
          .object({
            code: itineraryImportWarningCodeSchema,
            message: z
              .string()
              .trim()
              .min(1)
              .max(ITINERARY_IMPORT_LIMITS.warningMessageCharacters)
              .nullable(),
            dayIndex: z.number().int().nonnegative().nullable(),
            activityIndex: z.number().int().nonnegative().nullable(),
          })
          .strict()
      )
      .max(ITINERARY_IMPORT_LIMITS.warnings),
  })
  .strict();

export function parseOpenAIItineraryImportDraft(value: unknown): ItineraryImportDraft {
  const parsed = openAIItineraryImportDraftSchema.parse(value);
  return itineraryImportDraftSchema.parse({
    sourceSummary: parsed.sourceSummary,
    days: parsed.days.map((day) => ({
      ...(day.date !== null ? { date: day.date } : {}),
      ...(day.relativeDay !== null ? { relativeDay: day.relativeDay } : {}),
      ...(day.title !== null ? { title: day.title } : {}),
      ...(day.content !== null ? { content: day.content } : {}),
      activities: day.activities.map((activity) => ({
        ...(activity.time !== null ? { time: activity.time } : {}),
        ...(activity.endTime !== null ? { endTime: activity.endTime } : {}),
        title: activity.title,
        type: activity.type,
        ...(activity.locationName !== null ? { locationName: activity.locationName } : {}),
        ...(activity.note !== null ? { note: activity.note } : {}),
        ...(activity.confirmationCode !== null
          ? { confirmationCode: activity.confirmationCode }
          : {}),
      })),
    })),
    warnings: parsed.warnings.map((warning) => ({
      code: warning.code,
      ...(warning.message !== null ? { message: warning.message } : {}),
      ...(warning.dayIndex !== null ? { dayIndex: warning.dayIndex } : {}),
      ...(warning.activityIndex !== null ? { activityIndex: warning.activityIndex } : {}),
    })),
  });
}

export const itineraryImportRequestSchema = z
  .object({
    tripId: z.string().trim().min(1),
    locale: z.enum(locales).optional(),
    sourceText: z
      .string()
      .trim()
      .min(1, '請貼上行程內容')
      .refine(isItineraryImportSourceWithinLimit, {
        message: `輸入不可超過 ${ITINERARY_IMPORT_LIMITS.sourceCharacters} 字`,
      }),
  })
  .strict();

export type ItineraryImportActivity = z.infer<typeof itineraryImportActivitySchema>;
export type ItineraryImportDay = z.infer<typeof itineraryImportDaySchema>;
export type ItineraryImportDraft = z.infer<typeof itineraryImportDraftSchema>;
export type ItineraryImportWarning = z.infer<typeof itineraryImportWarningSchema>;
export type ItineraryImportWarningCode = z.infer<typeof itineraryImportWarningCodeSchema>;
export type ItineraryImportErrorCode = z.infer<typeof itineraryImportErrorCodeSchema>;
