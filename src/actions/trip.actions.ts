'use server';

import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/mongodb';
import mongoose from 'mongoose';
import { Trip as TripModel, type TripDoc } from '@/models';
import { deleteTripAtomically, TripDeletionError } from '@/lib/tripDeletion';
import { runTripCleanup } from '@/lib/tripCleanup';
import { getMemberTrip, getTripMembership } from '@/lib/permissions';
import { generateUniqueHashCode } from '@/lib/hashcode';
import { deletePrefixPage } from '@/lib/storage';
import {
  createTripSchema,
  updateTripSchema,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Trip, TripWithMembers } from '@/types';
import type { TripShell } from '@/types';
import { logger } from '@/lib/logger';
import { toTripDto } from '@/lib/dto';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';
import { isEffectiveTripDateRangeValid } from '@/lib/dateRange';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';
import {
  withItineraryDayUpdateTransaction,
  ItineraryDayUpdateError,
} from '@/lib/itineraryDayUpdate';

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
    const result = await getMemberTrip<LeanTrip>(
      session.userId,
      id,
      'name description startDate endDate destinationLocation hashCode createdAt legacyBudget currencySettings'
    );
    if (!result) {
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    }

    return { success: true, data: toTripDto(result.trip, session.userId) };
  } catch (error) {
    logger.error('Get trip error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

export const getTripShell = withAuth(
  async (session, id: string, viewerDate?: string): Promise<ActionResult<TripShell>> => {
    try {
      const result = await getMemberTrip<LeanTripShell>(
        session.userId,
        id,
        'name startDate endDate hashCode legacyBudget currencySettings'
      );
      if (!result) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      return { success: true, data: await readTripShell(result.trip, session.userId, viewerDate) };
    } catch (error) {
      logger.error('Get trip shell error', error);
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

      const { name, description, start_date, end_date, destination_location } = validation.data;

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

      const { name, description, start_date, end_date, destination_location } = validation.data;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || '';
      if (start_date !== undefined) updateData.startDate = start_date ? new Date(start_date) : null;
      if (end_date !== undefined) updateData.endDate = end_date ? new Date(end_date) : null;
      if (destination_location !== undefined)
        updateData.destinationLocation = destination_location ?? null;

      await dbConnect();
      const db = mongoose.connection.db!;
      const result = await withItineraryDayUpdateTransaction<ActionResult<Trip>>(
        db,
        membership.tripId,
        session.userId,
        async (transactionSession, currentDates) => {
          // Merge partial date edits with the dates protected by this transaction.
          if (
            (start_date !== undefined || end_date !== undefined) &&
            !isEffectiveTripDateRangeValid(
              currentDates.startDate,
              currentDates.endDate,
              start_date,
              end_date
            )
          ) {
            return { success: false, error: '開始日期不能晚於結束日期', code: 'VALIDATION_ERROR' };
          }
          const trip = await TripModel.findByIdAndUpdate(
            membership.tripId,
            { $set: updateData },
            { new: true, session: transactionSession }
          ).lean<LeanTrip>();
          if (!trip) throw new ItineraryDayUpdateError('FORBIDDEN');
          if (start_date !== undefined || end_date !== undefined) {
            await rebindAutoPhotosInTransaction(
              db,
              transactionSession,
              new mongoose.mongo.ObjectId(membership.tripId),
              trip,
              new Date()
            );
          }
          return { success: true, data: toTripDto(trip, session.userId) };
        }
      );
      if (result.success) revalidatePath(`/trips/${id}`);
      return result;
    } catch (error) {
      if (error instanceof ItineraryDayUpdateError) {
        return { success: false, error: error.code, code: error.code };
      }
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

      await deleteTripAtomically(mongoose.connection.db!, tripId, session.userId);
      // Durable job was committed with deletion. Storage failure cannot undo that success.
      await runTripCleanup(
        mongoose.connection.db!,
        (prefix) => deletePrefixPage('receipts', prefix),
        { tripId }
      ).catch((error) => logger.error('Delete trip: cleanup deferred', error));

      revalidatePath('/trips');
      return { success: true, data: { message: '旅行已刪除' } };
    } catch (error) {
      if (error instanceof TripDeletionError)
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
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

      // 通知既有成員「有新成員加入」（觸發者＝加入者，fan-out 預設排除自己）
      await notify({
        tripId: trip._id.toString(),
        actorId: session.userId,
        type: 'member_joined',
      });
      // 動態牆紀錄（觸發者＝加入者本人，動態牆會顯示）
      await logActivity({
        tripId: trip._id.toString(),
        actorId: session.userId,
        type: 'member_joined',
      });

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
