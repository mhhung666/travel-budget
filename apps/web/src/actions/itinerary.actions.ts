'use server';

import { readItinerary } from '@/lib/itineraryRead';
import { getTripMembership } from '@/lib/permissions';
import type { ActionResult } from './types';
import type { ItineraryDay as ItineraryDayDto } from '@/types';
import { withLedgerAuth as withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { isItineraryKeyForTrip } from '@/lib/uploads';
import { presignGet } from '@/lib/storage';
import {
  createItineraryDayForActor,
  updateItineraryDayForActor,
  mutateItineraryActivityForActor,
  deleteItineraryDayForActor,
} from '@/lib/itineraryMaintenance';

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

      return { success: true, data: await readItinerary(membership.tripId, true) };
    } catch (error) {
      logger.error('Get itinerary error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * Create a new itinerary day
 */
export const createItineraryDay = withAuth(
  (session, tripId: string, input: Parameters<typeof createItineraryDayForActor>[2]) =>
    createItineraryDayForActor(session.userId, tripId, input)
);

/**
 * Update an itinerary day
 */
export const updateItineraryDay = withAuth(
  (
    session,
    tripId: string,
    dayId: string,
    input: Parameters<typeof updateItineraryDayForActor>[3]
  ) => updateItineraryDayForActor(session.userId, tripId, dayId, input)
);

/** Match the target ID and revision in the same array element; siblings may change concurrently. */
export const mutateItineraryActivity = withAuth(
  (
    session,
    tripId: string,
    dayId: string,
    input: Parameters<typeof mutateItineraryActivityForActor>[3]
  ) => mutateItineraryActivityForActor(session.userId, tripId, dayId, input)
);

/**
 * Delete an itinerary day, preserving the remaining day numbers.
 * 刪除、關聯清理與相片重綁在同一交易完成；提交後才清理票券。
 */
export const deleteItineraryDay = withAuth((session, tripId: string, dayId: string) =>
  deleteItineraryDayForActor(session.userId, tripId, dayId)
);

/**
 * Sign a short-lived GET URL for a ticket attachment. Membership-gated, and the
 * key must belong to this trip's itinerary namespace — so a member of one trip
 * can't sign another trip's ticket even if they learn its key. Mirrors
 * getReceiptUrl (tickets share the private receipts bucket, different prefix).
 */
export const getItineraryAttachmentUrl = withAuth(
  async (session, tripIdOrCode: string, key: string): Promise<ActionResult<{ url: string }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!isItineraryKeyForTrip(membership.tripId, key)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const url = await presignGet('receipts', key);
      return { success: true, data: { url } };
    } catch (error) {
      logger.error('getItineraryAttachmentUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
