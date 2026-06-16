'use server';

import { dbConnect } from '@/lib/mongodb';
import { ItineraryDay } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { createItineraryDaySchema, updateItineraryDaySchema } from '@/lib/validation';
import type { ActionResult } from './types';
import type { ItineraryDay as ItineraryDayDto } from '@/types';
import { withAuth } from './withAuth';

type LeanDay = {
  _id: { toString(): string };
  trip: { toString(): string };
  dayNumber: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDayDto(d: LeanDay): ItineraryDayDto {
  return {
    id: d._id.toString(),
    trip_id: d.trip.toString(),
    day_number: d.dayNumber,
    title: d.title,
    content: d.content,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

/**
 * Get all itinerary days for a trip
 */
export const getItinerary = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ItineraryDayDto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const days = await ItineraryDay.find({ trip: membership.tripId })
        .sort({ dayNumber: 1 })
        .lean<LeanDay[]>();

      return { success: true, data: days.map(toDayDto) };
    } catch (error) {
      console.error('Get itinerary error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new itinerary day
 */
export const createItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: { title: string; content?: string }
  ): Promise<ActionResult<ItineraryDayDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validated = createItineraryDaySchema.parse(input);

      // Next day_number
      const last = await ItineraryDay.findOne({ trip: membership.tripId })
        .sort({ dayNumber: -1 })
        .select('dayNumber')
        .lean<{ dayNumber: number } | null>();
      const nextDayNumber = last ? last.dayNumber + 1 : 1;

      const created = await ItineraryDay.create({
        trip: membership.tripId,
        dayNumber: nextDayNumber,
        title: validated.title,
        content: validated.content || '',
      });

      return { success: true, data: toDayDto(created.toObject() as unknown as LeanDay) };
    } catch (error) {
      console.error('Create itinerary day error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update an itinerary day
 */
export const updateItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    dayId: string,
    input: { title?: string; content?: string; day_number?: number }
  ): Promise<ActionResult<ItineraryDayDto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validated = updateItineraryDaySchema.parse(input);

      const set: Record<string, unknown> = {};
      if (validated.title !== undefined) set.title = validated.title;
      if (validated.content !== undefined) set.content = validated.content;
      if (validated.day_number !== undefined) set.dayNumber = validated.day_number;

      const updated = await ItineraryDay.findOneAndUpdate(
        { _id: dayId, trip: membership.tripId },
        { $set: set },
        { new: true }
      ).lean<LeanDay | null>();

      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: toDayDto(updated) };
    } catch (error) {
      console.error('Update itinerary day error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete an itinerary day and renumber remaining days.
 * 取代原 Postgres RPC：刪除後以遞增順序 bulkWrite 重新編號，避免 (trip, dayNumber) 唯一索引衝突。
 */
export const deleteItineraryDay = withAuth(
  async (
    session,
    tripIdOrCode: string,
    dayId: string
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      await dbConnect();

      await ItineraryDay.deleteOne({ _id: dayId, trip: membership.tripId });

      // 重新編號剩餘行程日為連續 1..n（遞增處理，數字只會變小，不會撞到唯一索引）
      const remaining = await ItineraryDay.find({ trip: membership.tripId })
        .sort({ dayNumber: 1 })
        .select('_id dayNumber')
        .lean<{ _id: { toString(): string }; dayNumber: number }[]>();

      const ops = remaining
        .map((d, i) => ({ d, newNumber: i + 1 }))
        .filter(({ d, newNumber }) => d.dayNumber !== newNumber)
        .map(({ d, newNumber }) => ({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { dayNumber: newNumber } },
          },
        }));

      if (ops.length > 0) {
        await ItineraryDay.bulkWrite(ops, { ordered: true });
      }

      return { success: true, data: { message: 'DELETED' } };
    } catch (error) {
      console.error('Delete itinerary day error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
