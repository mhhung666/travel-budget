'use server';

import { activityCapacityFilter } from '@/lib/itineraryLimits';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import {
  withItineraryDayUpdateTransaction,
  ItineraryDayUpdateError,
} from '@/lib/itineraryDayUpdate';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';
import { ItineraryDay } from '@/models';
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
  | 'FORBIDDEN'
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
  session: mongoose.mongo.ClientSession;
}): Promise<ItineraryImportDayResult> {
  const current = await ItineraryDay.findOne(
    { trip: input.tripId, dayNumber: input.dayNumber },
    null,
    { session: input.session }
  )
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
      ...activityCapacityFilter(input.activities.length),
    },
    {
      $inc: { revision: 1 },
      $push: { activities: { $each: input.activities } },
      $addToSet: { appliedImportKeys: input.key },
    },
    { new: true, session: input.session }
  ).lean<ExistingDay | null>();

  if (updated) {
    return {
      date: input.date,
      status: 'success',
      addedActivities: input.activities.length,
    };
  }

  const raced = await ItineraryDay.findOne({ _id: current._id, trip: input.tripId }, null, {
    session: input.session,
  })
    .select('activities appliedImportKeys')
    .lean<ExistingDay | null>();
  if ((raced?.appliedImportKeys ?? []).includes(input.key)) {
    return { date: input.date, status: 'already_imported', addedActivities: 0 };
  }
  return failed(input.date, 'ACTIVITY_LIMIT');
}

async function applyDay(input: {
  tripId: string;
  operationId: string;
  startDate: string;
  endDate: string | null;
  day: GroupedDay;
  session: mongoose.mongo.ClientSession;
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
  const existing = await ItineraryDay.findOne({ trip: input.tripId, dayNumber }, null, {
    session: input.session,
  })
    .select('_id')
    .lean<{ _id: unknown } | null>();
  if (existing) {
    return appendToExistingDay({
      tripId: input.tripId,
      dayNumber,
      date,
      key,
      activities,
      session: input.session,
    });
  }
  if (!input.day.title?.trim()) return failed(date, 'MISSING_DAY_TITLE');

  await ItineraryDay.create(
    [
      {
        trip: input.tripId,
        dayNumber,
        title: input.day.title,
        content: input.day.content ?? '',
        location: null,
        activities,
        appliedImportKeys: [key],
      },
    ],
    { session: input.session }
  );
  return { date, status: 'success', addedActivities: activities.length };
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

      await dbConnect();
      const db = mongoose.connection.db!;
      const days: ItineraryImportDayResult[] = [];
      // Each date commits independently. Do not run parallel operations in one session.
      for (const day of groupDaysByDate(parsed.data.draft.days)) {
        try {
          days.push(
            await withItineraryDayUpdateTransaction(
              db,
              membership.tripId,
              session.userId,
              async (transactionSession, parent) => {
                const startDate = formatDate(parent.startDate);
                if (!startDate) return failed(day.date ?? '', 'TRIP_DATES_REQUIRED');
                const result = await applyDay({
                  tripId: membership.tripId,
                  operationId: parsed.data.operationId,
                  startDate,
                  endDate: formatDate(parent.endDate),
                  day,
                  session: transactionSession,
                });
                if (result.status === 'success') {
                  await rebindAutoPhotosInTransaction(
                    db,
                    transactionSession,
                    new mongoose.mongo.ObjectId(membership.tripId),
                    parent,
                    new Date()
                  );
                }
                return result;
              }
            )
          );
        } catch (error) {
          const code =
            error instanceof ItineraryDayUpdateError && error.code === 'FORBIDDEN'
              ? 'FORBIDDEN'
              : 'INTERNAL_ERROR';
          logger.warn('AI itinerary import day failed', { status: 'error', errorCode: code });
          days.push(failed(day.date ?? '', code));
        }
      }

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
