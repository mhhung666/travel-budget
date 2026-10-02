import { mongo } from 'mongoose';
import { withPhotoUpdateTransaction, PhotoUpdateError } from './photoUpdateTransaction';
import { assertBlobsAvailable, retireUnreferencedBlobs } from './blobReferences';
import { buildPhotoObjectKeys, sanitizedPhotoKey } from './uploads';
import {
  autoItineraryFields,
  buildItineraryDayDateMap,
  type PhotoItineraryDay,
} from './photoItinerary';
import { PHOTO_LIMIT_PER_TRIP, type PhotoItemInput } from './validation';
import type { BeginPhotoUploadInput } from './photoUploadProtocol';

// No TTL: keys must survive interrupted clients and failed cleanup runs.
export const PHOTO_UPLOAD_LEASE_MS = 24 * 60 * 60_000;
export interface PhotoUploadJob {
  _id: string;
  trip: mongo.ObjectId;
  user: mongo.ObjectId;
  key: string;
  thumbKey: string;
  sourceHash?: string;
  sourceSize?: number;
  displaySize: number;
  thumbSize: number;
  item?: PhotoItemInput;
  status: 'pending' | 'saved' | 'duplicate' | 'expired';
  photoId?: mongo.ObjectId;
  createdAt: Date;
  expiresAt: Date;
}
export const photoUploadJobs = (db: mongo.Db) => db.collection<PhotoUploadJob>('photouploadjobs');
export type UploadState =
  | { status: 'saved' | 'duplicate'; photoId: mongo.ObjectId }
  | { status: 'expired' | 'missing' | 'full' | 'deleted' }
  | { status: 'pending'; job: PhotoUploadJob };

function owned(job: PhotoUploadJob, tripId: string, userId: string) {
  if (job.trip.toHexString() !== tripId || job.user.toHexString() !== userId)
    throw new PhotoUpdateError('FORBIDDEN');
}
function state(job: PhotoUploadJob): UploadState {
  if (job.status === 'saved' || job.status === 'duplicate')
    return { status: job.status, photoId: job.photoId! };
  if (job.status === 'expired' || job.expiresAt.getTime() <= Date.now())
    return { status: 'expired' };
  return { status: 'pending', job };
}

/** Must precede URL signing. Retrying the same request cannot allocate another key pair. */
export async function beginPhotoUploadJob(
  db: mongo.Db,
  tripId: string,
  userId: string,
  input: BeginPhotoUploadInput
): Promise<UploadState> {
  return withPhotoUpdateTransaction(db, tripId, userId, async (session) => {
    const jobs = photoUploadJobs(db);
    const previous = await jobs.findOne({ _id: input.uploadId }, { session });
    if (previous) {
      owned(previous, tripId, userId);
      if (
        previous.sourceHash !== input.sourceHash ||
        previous.sourceSize !== input.sourceSize ||
        previous.displaySize !== input.displaySize ||
        previous.thumbSize !== input.thumbSize
      )
        throw new PhotoUpdateError('CONFLICT');
      const result = state(previous);
      if (result.status !== 'pending') return result;
      const expiresAt = new Date(Date.now() + PHOTO_UPLOAD_LEASE_MS);
      await jobs.updateOne({ _id: previous._id }, { $set: { expiresAt } }, { session });
      return { status: 'pending', job: { ...previous, expiresAt } };
    }
    const trip = new mongo.ObjectId(tripId);
    const duplicate = await db
      .collection('photos')
      .findOne({ trip, sourceHash: input.sourceHash }, { session });
    const now = new Date();
    const keys = buildPhotoObjectKeys(tripId);
    const job: PhotoUploadJob = {
      _id: input.uploadId,
      trip,
      user: new mongo.ObjectId(userId),
      ...keys,
      sourceHash: input.sourceHash,
      sourceSize: input.sourceSize,
      displaySize: input.displaySize,
      thumbSize: input.thumbSize,
      item: { ...input.item, key: keys.key, thumb_key: keys.thumbKey },
      status: duplicate ? 'duplicate' : 'pending',
      ...(duplicate ? { photoId: duplicate._id } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + PHOTO_UPLOAD_LEASE_MS),
    };
    if (
      !duplicate &&
      (await db.collection('photos').countDocuments({ trip }, { session })) >= PHOTO_LIMIT_PER_TRIP
    )
      return { status: 'full' };
    await jobs.insertOne(job, { session });
    return state(job);
  });
}

export async function readPhotoUploadJob(
  db: mongo.Db,
  tripId: string,
  userId: string,
  uploadId: string
): Promise<UploadState> {
  const job = await photoUploadJobs(db).findOne({ _id: uploadId });
  if (!job) return { status: 'missing' };
  owned(job, tripId, userId);
  return state(job);
}

/** HEAD happens before this function. Re-read under the Trip fence to exclude retirement,
 * concurrent finalizers, capacity races, member removal and trip deletion. */
export async function finalizePhotoUploadJob(
  db: mongo.Db,
  tripId: string,
  userId: string,
  uploadId: string
): Promise<UploadState> {
  return withPhotoUpdateTransaction(db, tripId, userId, async (session) => {
    const jobs = photoUploadJobs(db);
    const job = await jobs.findOne({ _id: uploadId }, { session });
    if (!job) return { status: 'missing' };
    owned(job, tripId, userId);
    const current = state(job);
    if (current.status !== 'pending') return current;
    if (!job.item || !job.sourceHash) throw new PhotoUpdateError('CONFLICT');
    const photos = db.collection('photos');
    const duplicate = await photos.findOne(
      { trip: job.trip, sourceHash: job.sourceHash },
      { session }
    );
    if (duplicate) {
      await jobs.updateOne(
        { _id: uploadId },
        { $set: { status: 'duplicate', photoId: duplicate._id } },
        { session }
      );
      // Delay physical deletion until the last issued URL and any in-flight PUT have expired.
      await retireUnreferencedBlobs(db, session, tripId, [
        job.key,
        job.thumbKey,
        sanitizedPhotoKey(job.key),
      ]);
      await db
        .collection<{ _id: string }>('blobcleanupjobs')
        .updateMany(
          { _id: { $in: [job.key, job.thumbKey, sanitizedPhotoKey(job.key)] } },
          { $max: { availableAt: job.expiresAt } },
          { session }
        );
      return { status: 'duplicate', photoId: duplicate._id };
    }
    if ((await photos.countDocuments({ trip: job.trip }, { session })) >= PHOTO_LIMIT_PER_TRIP)
      return { status: 'full' };
    await assertBlobsAvailable(db, session, [job.key, job.thumbKey]);
    const trip = await db.collection('trips').findOne({ _id: job.trip }, { session });
    const uploader = await db
      .collection('users')
      .findOne({ _id: job.user }, { session, projection: { displayName: 1 } });
    const item = job.item;
    const days =
      trip?.startDate && item.taken_local_date
        ? await db
            .collection<PhotoItineraryDay>('itinerarydays')
            .find({ trip: job.trip }, { session })
            .sort({ dayNumber: 1 })
            .toArray()
        : [];
    const auto = autoItineraryFields(
      item.taken_local_date,
      buildItineraryDayDateMap(trip?.startDate, trip?.endDate, days)
    );
    const now = new Date();
    const photoId = new mongo.ObjectId();
    await photos.insertOne(
      {
        _id: photoId,
        trip: job.trip,
        key: job.key,
        thumbKey: job.thumbKey,
        sourceHash: job.sourceHash,
        sourceHashVersion: 'sha256-file-v1',
        sourceSize: job.sourceSize,
        contentType: 'image/jpeg',
        size: job.displaySize,
        width: item.width ?? 0,
        height: item.height ?? 0,
        takenAt: item.taken_at ? new Date(item.taken_at) : null,
        takenLocalDate: item.taken_local_date ?? null,
        takenDateSource: item.taken_date_source ?? null,
        location: item.location ? { ...item.location, source: 'exif' } : auto.borrowedLocation,
        place: null,
        exif: {
          make: item.exif?.make,
          model: item.exif?.model,
          lens: item.exif?.lens,
          iso: item.exif?.iso,
          fNumber: item.exif?.f_number,
          exposureTime: item.exif?.exposure_time,
          focalLength: item.exif?.focal_length,
          orientation: item.exif?.orientation,
        },
        itineraryDay: auto.itineraryDay,
        itineraryDaySource: auto.itineraryDaySource,
        caption: item.caption ?? '',
        uploadedBy: job.user,
        uploadedByName: uploader?.displayName ?? '',
        createdAt: now,
        updatedAt: now,
      },
      { session }
    );
    await jobs.updateOne({ _id: uploadId }, { $set: { status: 'saved', photoId } }, { session });
    return { status: 'saved', photoId };
  });
}

/** Bounded discovery; durable blob jobs own deletion and the second sweep. A system worker
 * uses the same Trip write fence without requiring the original uploader to remain a member. */
export async function expirePhotoUploadJobs(
  db: mongo.Db,
  options: { now?: Date; deadline?: number } = {}
) {
  const now = options.now ?? new Date();
  const jobs = photoUploadJobs(db);
  const due = await jobs
    .find({ status: 'pending', expiresAt: { $lte: now } })
    .sort({ expiresAt: 1 })
    .limit(100)
    .toArray();
  let retired = 0;
  for (const candidate of due) {
    if (options.deadline && Date.now() >= options.deadline) break;
    const changed = await db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          await db
            .collection('trips')
            .findOneAndUpdate(
              { _id: candidate.trip },
              { $inc: { expenseDeliveryFence: 1 } },
              { session }
            );
          const job = await jobs.findOne(
            { _id: candidate._id, status: 'pending', expiresAt: { $lte: now } },
            { session }
          );
          if (!job) return false;
          await retireUnreferencedBlobs(db, session, job.trip.toHexString(), [
            job.key,
            job.thumbKey,
            sanitizedPhotoKey(job.key),
          ]);
          await jobs.updateOne({ _id: job._id }, { $set: { status: 'expired' } }, { session });
          return true;
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 5000,
        }
      )
    );
    if (changed) retired++;
  }
  return retired;
}
