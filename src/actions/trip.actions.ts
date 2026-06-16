'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import { Trip as TripModel, Expense, ItineraryDay, type TripDoc } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { generateUniqueHashCode } from '@/lib/hashcode';
import {
  createTripSchema,
  updateTripSchema,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Trip, TripWithMembers } from '@/types';

/** 將 Mongoose Trip 文件映射為對外 DTO（維持 snake_case 以相容前端） */
type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

function toTripDto(t: LeanTrip): Trip {
  return {
    id: t._id.toString(),
    name: t.name,
    description: t.description ?? null,
    start_date: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    end_date: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
    location: (t.location ?? null) as Trip['location'],
    hash_code: t.hashCode,
    created_at: t.createdAt.toISOString(),
  };
}

/**
 * Get all trips for the current user
 */
export const getTrips = withAuth(async (session): Promise<ActionResult<TripWithMembers[]>> => {
  try {
    await dbConnect();
    const trips = await TripModel.find({ 'members.user': session.userId })
      .sort({ createdAt: -1 })
      .lean<LeanTrip[]>();

    const formattedTrips: TripWithMembers[] = trips.map((trip) => ({
      ...toTripDto(trip),
      member_count: trip.members.length,
    }));

    return { success: true, data: formattedTrips };
  } catch (error) {
    console.error('Get trips error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/**
 * Get a single trip by ID or hash code
 */
export const getTrip = withAuth(async (session, id: string): Promise<ActionResult<Trip>> => {
  try {
    const membership = await getTripMembership(session.userId, id);
    if (!membership) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    const trip = await TripModel.findById(membership.tripId).lean<LeanTrip>();
    if (!trip) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    return { success: true, data: toTripDto(trip) };
  } catch (error) {
    console.error('Get trip error:', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/**
 * Get trip preview info for join page (no membership required)
 * Returns basic trip info + member count + whether current user is already a member
 */
export const getTripPreview = withAuth(
  async (
    session,
    hashCode: string
  ): Promise<ActionResult<TripWithMembers & { isMember: boolean }>> => {
    try {
      await dbConnect();
      const trip = await TripModel.findOne({ hashCode }).lean<LeanTrip>();
      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const isMember = trip.members.some((m) => m.user.toString() === session.userId);

      return {
        success: true,
        data: {
          ...toTripDto(trip),
          member_count: trip.members.length,
          isMember,
        },
      };
    } catch (error) {
      console.error('Get trip preview error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new trip
 */
export const createTrip = withAuth(
  async (session, input: CreateTripInput): Promise<ActionResult<Trip>> => {
    try {
      const validation = createTripSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { name, description, start_date, end_date, location } = validation.data;

      await dbConnect();

      // Generate unique hash code
      const hashCode = await generateUniqueHashCode(async (code) => {
        return (await TripModel.exists({ hashCode: code })) !== null;
      });

      // Create trip with the creator as admin member
      const trip = await TripModel.create({
        name,
        description: description?.trim() || '',
        startDate: start_date ? new Date(start_date) : undefined,
        endDate: end_date ? new Date(end_date) : undefined,
        location: location ?? undefined,
        hashCode,
        members: [{ user: session.userId, role: 'admin' }],
      });

      revalidatePath('/trips');
      return { success: true, data: toTripDto(trip.toObject() as LeanTrip) };
    } catch (error) {
      console.error('Create trip error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Update a trip (admin only)
 */
export const updateTrip = withAuth(
  async (session, id: string, input: UpdateTripInput): Promise<ActionResult<Trip>> => {
    try {
      const membership = await getTripMembership(session.userId, id);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validation = updateTripSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { name, description, start_date, end_date, location } = validation.data;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || '';
      if (start_date !== undefined) updateData.startDate = start_date ? new Date(start_date) : null;
      if (end_date !== undefined) updateData.endDate = end_date ? new Date(end_date) : null;
      if (location !== undefined) updateData.location = location ?? null;

      const trip = await TripModel.findByIdAndUpdate(
        membership.tripId,
        { $set: updateData },
        {
          new: true,
        }
      ).lean<LeanTrip>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${id}`);
      return { success: true, data: toTripDto(trip) };
    } catch (error) {
      console.error('Update trip error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Delete a trip (admin only)
 */
export const deleteTrip = withAuth(
  async (session, id: string): Promise<ActionResult<{ message: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, id);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const tripId = membership.tripId;

      // MongoDB 無外鍵 cascade，需手動清除關聯資料
      await Promise.all([
        Expense.deleteMany({ trip: tripId }),
        ItineraryDay.deleteMany({ trip: tripId }),
      ]);
      await TripModel.deleteOne({ _id: tripId });

      revalidatePath('/trips');
      return { success: true, data: { message: '旅行已刪除' } };
    } catch (error) {
      console.error('Delete trip error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Join a trip using trip ID or hash code
 */
export const joinTrip = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<Trip>> => {
    try {
      if (!tripIdOrCode) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (membership) {
        // 已是成員
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
      }

      // 加入為一般成員（addToSet 防併發重複）
      const trip = await TripModel.findOneAndUpdate(
        {
          $or: [
            ...(isObjectIdLike(tripIdOrCode) ? [{ _id: tripIdOrCode }] : []),
            { hashCode: tripIdOrCode },
          ],
        },
        { $push: { members: { user: session.userId, role: 'member' } } },
        { new: true }
      ).lean<LeanTrip>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath('/trips');
      return { success: true, data: toTripDto(trip) };
    } catch (error) {
      console.error('Join trip error:', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

function isObjectIdLike(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
