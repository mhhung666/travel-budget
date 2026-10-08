'use server';

import { readTripShell, type LeanTripShell } from '@/lib/tripShellRead';
import { readMemberTrips } from '@/lib/tripListRead';
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
import { deliverJoinNotification } from '@/lib/notify';
import { enterTrip, TripEntryError } from '@/lib/tripEntry';
import { randomUUID } from 'node:crypto';
import { inviteCodeSchema } from '@travel-budget/contracts';
import { updateTripForActor, archiveTripForActor, TripManagementError } from '@/lib/tripManagement';
import { TripWriteError } from '@/lib/tripWriteTransaction';

/** 將 Mongoose Trip 文件映射為對外 DTO（維持 snake_case 以相容前端） */
type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/**
 * Get all trips for the current user
 */
export const getTrips = withAuth(async (session): Promise<ActionResult<TripWithMembers[]>> => {
  try {
    const formattedTrips = await readMemberTrips(session.userId);
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
  async (session, input: CreateTripInput): Promise<ActionResult<Pick<Trip, 'id'>>> => {
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

      const result = await enterTrip(
        mongoose.connection.db!,
        session.userId,
        'trip.create',
        {
          client_request_id: randomUUID(),
          name,
          description: description ?? '',
          start_date: start_date || null,
          end_date: end_date || null,
        },
        undefined,
        destination_location
      );
      try {
        revalidatePath('/trips');
      } catch {
        logger.error('Trip cache refresh failed');
      }
      // The write is committed. Navigation needs only its ID; a later read failure
      // must not invite the form to create another trip with a new UUID.
      return { success: true, data: { id: result.tripId } };
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

      await dbConnect();
      const trip = await updateTripForActor(
        mongoose.connection.db!,
        session.userId,
        membership.tripId,
        validation.data
      );
      try {
        revalidatePath(`/trips/${id}`);
        revalidatePath('/trips');
      } catch {
        logger.error('Trip cache refresh failed');
      }
      return { success: true, data: toTripDto(trip as unknown as LeanTrip, session.userId) };
    } catch (error) {
      if (error instanceof TripManagementError || error instanceof TripWriteError) {
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

      try {
        revalidatePath('/trips');
      } catch (error) {
        logger.error('Delete trip cache refresh failed after commit', error);
      }
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

      const trip = await TripModel.findOneAndUpdate(
        {
          _id: membership.tripId,
          expenseDeliveryDeleting: { $ne: true },
          members: { $elemMatch: { user: session.userId, role: 'admin' } },
        },
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

  const trip = await archiveTripForActor(
    mongoose.connection.db!,
    session.userId,
    membership.tripId,
    !!archivedAt
  );
  try {
    revalidatePath('/trips');
    revalidatePath(`/trips/${membership.tripId}`);
  } catch {
    logger.error('Trip cache refresh failed');
  }
  return { success: true, data: toTripDto(trip as unknown as LeanTrip, session.userId) };
}

export const archiveTrip = withAuth(async (session, id: string): Promise<ActionResult<Trip>> => {
  try {
    return await setArchivedAt(session, id, new Date());
  } catch (error) {
    if (error instanceof TripWriteError || error instanceof TripEntryError)
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
    logger.error('Archive trip error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

export const unarchiveTrip = withAuth(async (session, id: string): Promise<ActionResult<Trip>> => {
  try {
    return await setArchivedAt(session, id, null);
  } catch (error) {
    if (error instanceof TripWriteError || error instanceof TripEntryError)
      return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
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

      // Web retains its historical ObjectId entry; Mobile accepts only a validated invitation.
      const target = isObjectIdLike(tripIdOrCode)
        ? await TripModel.findById(tripIdOrCode).select('hashCode').lean<{ hashCode: string }>()
        : null;
      if (!inviteCodeSchema.safeParse(target?.hashCode ?? tripIdOrCode).success)
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const result = await enterTrip(
        mongoose.connection.db!,
        session.userId,
        'trip.join',
        {
          client_request_id: randomUUID(),
          invite_code: target?.hashCode ?? tripIdOrCode,
        },
        deliverJoinNotification
      );
      // Notification delivery may have awaited removal or deletion after commit.
      // Authorize in the same query that reads the current private trip fields.
      const trip = await TripModel.findOne({
        _id: result.tripId,
        'members.user': session.userId,
        expenseDeliveryDeleting: { $ne: true },
      }).lean<LeanTrip>();
      if (!trip) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };

      try {
        revalidatePath('/trips');
      } catch {
        logger.error('Trip cache refresh failed');
      }
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      if (error instanceof TripEntryError)
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      logger.error('Join trip error');
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

function isObjectIdLike(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
