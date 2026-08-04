'use server';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ItineraryDay, Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { activitySchema } from '@/lib/validation';
import { ITINERARY_IMPORT_LIMITS } from '@/lib/ai/importLimits';
import {
  itineraryImportDraftSchema,
  type ItineraryImportActivity,
  type ItineraryImportDay,
} from '@/lib/ai/itineraryImportSchema';
import { logger } from '@/lib/logger';
import { logActivity } from '@/lib/activity';
import { rebindAutoPhotosToItinerary } from '@/lib/photoItinerary';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';

const confirmItineraryImportInputSchema = z
  .object({
    operationId: z.string().uuid(),
    draft: itineraryImportDraftSchema,
  })
  .strict();

export type ItineraryImportDayStatus = 'success' | 'already_imported' | 'failed';
export type ItineraryImportDayErrorCode =
  | 'TRIP_DATES_REQUIRED'
  | 'MISSING_DATE'
  | 'DATE_OUTSIDE_TRIP'
  | 'MISSING_DAY_TITLE'
  | 'ACTIVITY_LIMIT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export type ItineraryImportDayResult = {
  date: string;
  status: ItineraryImportDayStatus;
  addedActivities: number;
  errorCode?: ItineraryImportDayErrorCode;
};

export type ItineraryImportConfirmation = {
  operationId: string;
  days: ItineraryImportDayResult[];
  summary: {
    successfulDays: number;
    addedActivities: number;
    alreadyImportedDays: number;
    failedDays: number;
  };
};

type LeanTripDates = { startDate?: Date | null; endDate?: Date | null };
type ExistingDay = {
  _id: unknown;
  appliedImportKeys?: string[];
  activities?: unknown[];
};
type GroupedDay = ItineraryImportDay & { date?: string };

function formatDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dayNumberForDate(startDate: string, date: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const target = Date.parse(`${date}T00:00:00.000Z`);
  return Math.round((target - start) / 86_400_000) + 1;
}

function importKey(tripId: string, operationId: string, date: string): string {
  return createHash('sha256').update(`${tripId}:${operationId}:${date}`).digest('hex');
}

function groupDaysByDate(days: ItineraryImportDay[]): GroupedDay[] {
  const grouped = new Map<string, GroupedDay>();
  const withoutDate: GroupedDay[] = [];

  for (const day of days) {
    if (!day.date) {
      withoutDate.push({ ...day, activities: [...day.activities] });
      continue;
    }
    const existing = grouped.get(day.date);
    if (!existing) {
      grouped.set(day.date, { ...day, activities: [...day.activities] });
      continue;
    }
    existing.activities.push(...day.activities);
    if (!existing.title && day.title) existing.title = day.title;
    if (day.content)
      existing.content = [existing.content, day.content].filter(Boolean).join('\n\n');
  }

  return [...grouped.values(), ...withoutDate];
}

function activityStorage(activity: ItineraryImportActivity): Record<string, unknown> {
  const validated = activitySchema.parse({
    time: activity.time ?? null,
    end_time: activity.endTime ?? null,
    title: activity.title,
    type: activity.type,
    location: null,
    location_name: activity.locationName ?? '',
    note: activity.note ?? '',
    confirmation_code: activity.confirmationCode ?? '',
    attachments: [],
  });
  return {
    time: validated.time,
    endTime: validated.end_time,
    title: validated.title,
    type: validated.type,
    location: null,
    locationName: validated.location_name,
    note: validated.note,
    confirmationCode: validated.confirmation_code,
    attachments: [],
  };
}

function failed(date: string, errorCode: ItineraryImportDayErrorCode): ItineraryImportDayResult {
  return { date, status: 'failed', addedActivities: 0, errorCode };
}

async function appendToExistingDay(input: {
  tripId: string;
  dayNumber: number;
  date: string;
  key: string;
  activities: Record<string, unknown>[];
}): Promise<ItineraryImportDayResult> {
  const current = await ItineraryDay.findOne({ trip: input.tripId, dayNumber: input.dayNumber })
    .select('_id activities appliedImportKeys')
    .lean<ExistingDay | null>();
  if (!current) return failed(input.date, 'INTERNAL_ERROR');
  if ((current.appliedImportKeys ?? []).includes(input.key)) {
    return { date: input.date, status: 'already_imported', addedActivities: 0 };
  }

  const maximumExisting = ITINERARY_IMPORT_LIMITS.activitiesPerDay - input.activities.length;
  if (maximumExisting < 0 || (current.activities?.length ?? 0) > maximumExisting) {
    return failed(input.date, 'ACTIVITY_LIMIT');
  }

  const updated = await ItineraryDay.findOneAndUpdate(
    {
      _id: current._id,
      trip: input.tripId,
      appliedImportKeys: { $ne: input.key },
      $expr: {
        $lte: [{ $size: { $ifNull: ['$activities', []] } }, maximumExisting],
      },
    },
    {
      $push: { activities: { $each: input.activities } },
      $addToSet: { appliedImportKeys: input.key },
    },
    { new: true }
  ).lean<ExistingDay | null>();

  if (updated) {
    return {
      date: input.date,
      status: 'success',
      addedActivities: input.activities.length,
    };
  }

  const raced = await ItineraryDay.findOne({ _id: current._id, trip: input.tripId })
    .select('activities appliedImportKeys')
    .lean<ExistingDay | null>();
  if ((raced?.appliedImportKeys ?? []).includes(input.key)) {
    return { date: input.date, status: 'already_imported', addedActivities: 0 };
  }
  return failed(input.date, 'ACTIVITY_LIMIT');
}

function isDuplicateKeyError(error: unknown): boolean {
  return !!error && typeof error === 'object' && Reflect.get(error, 'code') === 11000;
}

async function applyDay(input: {
  tripId: string;
  operationId: string;
  startDate: string;
  endDate: string | null;
  day: GroupedDay;
}): Promise<ItineraryImportDayResult> {
  const date = input.day.date;
  if (!date) return failed('', 'MISSING_DATE');
  if (date < input.startDate || (input.endDate && date > input.endDate)) {
    return failed(date, 'DATE_OUTSIDE_TRIP');
  }
  if (input.day.activities.length > ITINERARY_IMPORT_LIMITS.activitiesPerDay) {
    return failed(date, 'ACTIVITY_LIMIT');
  }

  let activities: Record<string, unknown>[];
  try {
    activities = input.day.activities.map(activityStorage);
  } catch {
    return failed(date, 'VALIDATION_ERROR');
  }

  const dayNumber = dayNumberForDate(input.startDate, date);
  const key = importKey(input.tripId, input.operationId, date);
  const existing = await ItineraryDay.findOne({ trip: input.tripId, dayNumber })
    .select('_id')
    .lean<{ _id: unknown } | null>();
  if (existing) {
    return appendToExistingDay({
      tripId: input.tripId,
      dayNumber,
      date,
      key,
      activities,
    });
  }
  if (!input.day.title?.trim()) return failed(date, 'MISSING_DAY_TITLE');

  try {
    await ItineraryDay.create({
      trip: input.tripId,
      dayNumber,
      title: input.day.title,
      content: input.day.content ?? '',
      location: null,
      activities,
      appliedImportKeys: [key],
    });
    return { date, status: 'success', addedActivities: activities.length };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return appendToExistingDay({
        tripId: input.tripId,
        dayNumber,
        date,
        key,
        activities,
      });
    }
    logger.warn('AI itinerary import day failed', { status: 'error', errorCode: 'INTERNAL_ERROR' });
    return failed(date, 'INTERNAL_ERROR');
  }
}

export const confirmItineraryImport = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: unknown
  ): Promise<ActionResult<ItineraryImportConfirmation>> => {
    const parsed = confirmItineraryImportInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    }

    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const trip = await Trip.findById(membership.tripId)
        .select('startDate endDate')
        .lean<LeanTripDates | null>();
      if (!trip) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      const startDate = formatDate(trip.startDate);
      const endDate = formatDate(trip.endDate);
      const groupedDays = groupDaysByDate(parsed.data.draft.days);
      const days = startDate
        ? await Promise.all(
            groupedDays.map((day) =>
              applyDay({
                tripId: membership.tripId,
                operationId: parsed.data.operationId,
                startDate,
                endDate,
                day,
              })
            )
          )
        : groupedDays.map((day) => failed(day.date ?? '', 'TRIP_DATES_REQUIRED'));

      const summary = {
        successfulDays: days.filter((day) => day.status === 'success').length,
        addedActivities: days.reduce((sum, day) => sum + day.addedActivities, 0),
        alreadyImportedDays: days.filter((day) => day.status === 'already_imported').length,
        failedDays: days.filter((day) => day.status === 'failed').length,
      };
      logger.info('AI itinerary import confirmed', {
        status: summary.failedDays > 0 ? 'partial' : 'success',
        ...summary,
      });
      if (summary.addedActivities > 0 || summary.successfulDays > 0) {
        await rebindAutoPhotosToItinerary(membership.tripId, trip.startDate, trip.endDate).catch(
          () =>
            logger.warn('AI itinerary import photo rebind failed', {
              status: 'error',
              errorCode: 'INTERNAL_ERROR',
            })
        );
        await logActivity({
          tripId: membership.tripId,
          actorId: session.userId,
          type: 'itinerary_imported',
          meta: { days: summary.successfulDays, activities: summary.addedActivities },
        });
      }

      return {
        success: true,
        data: { operationId: parsed.data.operationId, days, summary },
      };
    } catch {
      logger.warn('AI itinerary import confirmation failed', {
        status: 'error',
        errorCode: 'INTERNAL_ERROR',
      });
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
