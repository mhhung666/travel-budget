'use server';

import mongoose from 'mongoose';
import { after } from 'next/server';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { getTripMembership } from '@/lib/permissions';
import { Photo, Trip } from '@/models';
import { toTripPhotoDto, type TripPhotoDtoInput } from '@/lib/dto';
import { headObject, presignPut, presignGetStable } from '@/lib/storage';
import { ensureSanitizedPhotoCopy } from '@/lib/photoSanitize';
import {
  beginPhotoUploadJob,
  finalizePhotoUploadJob,
  readPhotoUploadJob,
  type UploadState,
  type PhotoUploadJob,
} from '@/lib/photoUploadJobs';
import {
  beginPhotoUploadSchema,
  photoHashSchema,
  photoUploadIdSchema,
  type BeginPhotoUploadInput,
  type PhotoUploadReply,
} from '@/lib/photoUploadProtocol';
import { PhotoUpdateError } from '@/lib/photoUpdateTransaction';
import { RetiredBlobError } from '@/lib/blobReferences';
import { logger } from '@/lib/logger';
import type { TripPhoto } from '@/types';

async function photoDto(tripId: string, photoId: string): Promise<TripPhoto | null> {
  const photo = await Photo.findOne({ trip: tripId, _id: photoId }).lean<
    TripPhotoDtoInput & { key: string; thumbKey: string }
  >();
  if (!photo) return null;
  const [url, thumbUrl] = await Promise.all([
    presignGetStable('receipts', photo.key),
    presignGetStable('receipts', photo.thumbKey),
  ]);
  return toTripPhotoDto(photo, { url, thumbUrl });
}

function failure(error: unknown): ActionResult<never> {
  if (error instanceof PhotoUpdateError || error instanceof RetiredBlobError)
    return { success: false, error: error.code, code: error.code };
  logger.error('Photo upload action failed', error);
  return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
}
const invalid = (): ActionResult<never> => ({
  success: false,
  error: 'VALIDATION_ERROR',
  code: 'VALIDATION_ERROR',
});

async function reply(
  tripId: string,
  result: Exclude<UploadState, { status: 'pending' }>
): Promise<ActionResult<PhotoUploadReply>> {
  if (!('photoId' in result)) return { success: true, data: { status: result.status } };
  const photo = await photoDto(tripId, result.photoId.toHexString());
  if (!photo) return { success: true, data: { status: 'deleted' } };
  if (result.status === 'saved') {
    // The private album can confirm immediately; public readers only receive the sanitized copy.
    // Public album reads also repair missing copies if this bounded post-response work fails.
    after(async () => {
      try {
        const trip = await Trip.findById(tripId).select('albumShareCode').lean();
        if (trip?.albumShareCode) {
          const stored = await Photo.findOne({ trip: tripId, _id: photo.id }).select('key').lean();
          if (stored) await ensureSanitizedPhotoCopy(stored.key);
        }
      } catch (error) {
        logger.error('Photo upload sanitize deferred', error);
      }
    });
  }
  return { success: true, data: { status: result.status, photo } };
}

/** A transient HEAD failure must throw, never masquerade as a missing object. */
async function parts(job: PhotoUploadJob) {
  const [display, thumb] = await Promise.all([
    headObject('receipts', job.key, { strict: true }),
    headObject('receipts', job.thumbKey, { strict: true }),
  ]);
  return {
    display: display?.contentType === 'image/jpeg' && display.size === job.displaySize,
    thumb: thumb?.contentType === 'image/webp' && thumb.size === job.thumbSize,
  };
}

export const findDuplicatePhoto = withAuth(
  async (
    session,
    tripIdOrCode: string,
    sourceHash: string
  ): Promise<ActionResult<TripPhoto | null>> => {
    try {
      if (!photoHashSchema.safeParse(sourceHash).success) return invalid();
      const member = await getTripMembership(session.userId, tripIdOrCode);
      if (!member) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const photo = await Photo.findOne({ trip: member.tripId, sourceHash }).select('_id').lean();
      return {
        success: true,
        data: photo ? await photoDto(member.tripId, photo._id.toString()) : null,
      };
    } catch (error) {
      return failure(error);
    }
  }
);

export const beginPhotoUpload = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: BeginPhotoUploadInput
  ): Promise<ActionResult<PhotoUploadReply>> => {
    try {
      const parsed = beginPhotoUploadSchema.safeParse(input);
      if (!parsed.success) return invalid();
      const member = await getTripMembership(session.userId, tripIdOrCode);
      if (!member) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const result = await beginPhotoUploadJob(
        mongoose.connection.db!,
        member.tripId,
        session.userId,
        parsed.data
      );
      if (result.status !== 'pending') return await reply(member.tripId, result);
      const present = await parts(result.job);
      // A signing delay must never outlive the durable lease.
      if (result.job.expiresAt.getTime() < Date.now() + 10 * 60_000)
        return { success: true, data: { status: 'expired' } };
      const [displayUrl, thumbUrl] = await Promise.all([
        present.display ? undefined : presignPut('receipts', result.job.key, 'image/jpeg'),
        present.thumb ? undefined : presignPut('receipts', result.job.thumbKey, 'image/webp'),
      ]);
      return { success: true, data: { status: 'pending', displayUrl, thumbUrl } };
    } catch (error) {
      return failure(error);
    }
  }
);

/** Also resolves lost PUT/finalize responses; no new keys are allocated by this action. */
export const finishPhotoUpload = withAuth(
  async (
    session,
    tripIdOrCode: string,
    uploadId: string
  ): Promise<ActionResult<PhotoUploadReply>> => {
    try {
      if (!photoUploadIdSchema.safeParse(uploadId).success) return invalid();
      const member = await getTripMembership(session.userId, tripIdOrCode);
      if (!member) return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      const db = mongoose.connection.db!;
      const current = await readPhotoUploadJob(db, member.tripId, session.userId, uploadId);
      if (current.status !== 'pending') return await reply(member.tripId, current);
      const present = await parts(current.job);
      if (!present.display || !present.thumb) return { success: true, data: { status: 'pending' } };
      const result = await finalizePhotoUploadJob(db, member.tripId, session.userId, uploadId);
      if (result.status === 'pending') return { success: true, data: { status: 'pending' } };
      return await reply(member.tripId, result);
    } catch (error) {
      return failure(error);
    }
  }
);
