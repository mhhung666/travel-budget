'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import {
  Trip as TripModel,
  Expense,
  ItineraryDay,
  Payment,
  Checklist,
  type TripDoc,
} from '@/models';
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
import { logger } from '@/lib/logger';
import { toTripDto } from '@/lib/dto';

/** 將 Mongoose Trip 文件映射為對外 DTO（維持 snake_case 以相容前端） */
type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/**
 * Get all trips for the current user
 */
export const getTrips = withAuth(async (session): Promise<ActionResult<TripWithMembers[]>> => {
  try {
    await dbConnect();
    const trips = await TripModel.find({ 'members.user': session.userId })
      .sort({ createdAt: -1 })
      .lean<LeanTrip[]>();

    // 依旅行日期（startDate）新到舊排序，沒有日期的旅程放最後。
    // DB 已先按 createdAt 由新到舊，stable sort 讓同日期 / 皆無日期者維持此序。
    trips.sort((a, b) => {
      const ta = a.startDate ? new Date(a.startDate).getTime() : null;
      const tb = b.startDate ? new Date(b.startDate).getTime() : null;
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1; // a 無日期 → 排後面
      if (tb === null) return -1; // b 無日期 → 排後面
      return tb - ta; // 新到舊
    });

    const formattedTrips: TripWithMembers[] = trips.map((trip) => ({
      ...toTripDto(trip, session.userId),
      member_count: trip.members.length,
    }));

    return { success: true, data: formattedTrips };
  } catch (error) {
    logger.error('Get trips error', error);
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

    return { success: true, data: toTripDto(trip, session.userId) };
  } catch (error) {
    logger.error('Get trip error', error);
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
          ...toTripDto(trip, session.userId),
          member_count: trip.members.length,
          isMember,
        },
      };
    } catch (error) {
      logger.error('Get trip preview error', error);
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

      const { name, description, start_date, end_date, departure_location, destination_location } =
        validation.data;

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
        departureLocation: departure_location ?? undefined,
        destinationLocation: destination_location ?? undefined,
        hashCode,
        members: [{ user: session.userId, role: 'admin' }],
      });

      revalidatePath('/trips');
      return { success: true, data: toTripDto(trip.toObject() as LeanTrip, session.userId) };
    } catch (error) {
      logger.error('Create trip error', error);
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

      const { name, description, start_date, end_date, departure_location, destination_location } =
        validation.data;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || '';
      if (start_date !== undefined) updateData.startDate = start_date ? new Date(start_date) : null;
      if (end_date !== undefined) updateData.endDate = end_date ? new Date(end_date) : null;
      if (departure_location !== undefined)
        updateData.departureLocation = departure_location ?? null;
      if (destination_location !== undefined)
        updateData.destinationLocation = destination_location ?? null;

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
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      logger.error('Update trip error', error);
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

      // MongoDB 無外鍵 cascade，需手動清除關聯資料（支出、行程日、結算還款、清單）
      await Promise.all([
        Expense.deleteMany({ trip: tripId }),
        ItineraryDay.deleteMany({ trip: tripId }),
        Payment.deleteMany({ trip: tripId }),
        Checklist.deleteMany({ trip: tripId }),
      ]);
      await TripModel.deleteOne({ _id: tripId });

      revalidatePath('/trips');
      return { success: true, data: { message: '旅行已刪除' } };
    } catch (error) {
      logger.error('Delete trip error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Regenerate a trip's share hash_code (admin only).
 *
 * This is the "revoke share link" capability: it replaces the trip's hash_code
 * with a fresh unique one, so every existing /join and /api/public link stops
 * resolving immediately. Use when a share link has leaked or should no longer
 * grant access. Members are unaffected (they resolve trips by membership, not
 * by hash_code).
 */
export const regenerateHashCode = withAuth(
  async (session, id: string): Promise<ActionResult<Trip>> => {
    try {
      const membership = await getTripMembership(session.userId, id);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const hashCode = await generateUniqueHashCode(async (code) => {
        return (await TripModel.exists({ hashCode: code })) !== null;
      });

      const trip = await TripModel.findByIdAndUpdate(
        membership.tripId,
        { $set: { hashCode } },
        { new: true }
      ).lean<LeanTrip>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath('/trips');
      revalidatePath(`/trips/${membership.tripId}`);
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      logger.error('Regenerate hash code error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Archive / unarchive a trip for the current user only (soft, per-member).
 *
 * Archiving is personal list-management: it sets `archivedAt` on the caller's own
 * embedded member entry, so the trip moves to their "archived" tab without
 * affecting how anyone else sees it. Any member may do this (not admin-only); the
 * trip's data stays fully readable/writable. Unarchiving clears it back to null.
 */
async function setArchivedAt(
  session: { userId: string },
  id: string,
  archivedAt: Date | null
): Promise<ActionResult<Trip>> {
  const membership = await getTripMembership(session.userId, id);
  if (!membership) {
    return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
  }

  // 定位到當前使用者那筆 member，只改自己的 archivedAt（positional `$`）
  const trip = await TripModel.findOneAndUpdate(
    { _id: membership.tripId, 'members.user': session.userId },
    { $set: { 'members.$.archivedAt': archivedAt } },
    { new: true }
  ).lean<LeanTrip>();

  if (!trip) {
    return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
  }

  revalidatePath('/trips');
  return { success: true, data: toTripDto(trip, session.userId) };
}

export const archiveTrip = withAuth(async (session, id: string): Promise<ActionResult<Trip>> => {
  try {
    return await setArchivedAt(session, id, new Date());
  } catch (error) {
    logger.error('Archive trip error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

export const unarchiveTrip = withAuth(async (session, id: string): Promise<ActionResult<Trip>> => {
  try {
    return await setArchivedAt(session, id, null);
  } catch (error) {
    logger.error('Unarchive trip error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

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
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      logger.error('Join trip error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

function isObjectIdLike(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
