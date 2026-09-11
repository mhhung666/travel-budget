// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { runBlobCleanup } from '@/lib/blobCleanup';
import {
  up as blobUp,
  down as blobDown,
} from '../../migrations/20260911090000-blob-cleanup-jobs.js';
import { deleteItineraryDayAtomically } from '@/lib/itineraryDayDeletion';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItineraryDay, Note, Trip } from '@/models';
import {
  createItineraryDay,
  deleteItineraryDay,
  mutateItineraryActivity,
  updateItineraryDay,
} from '@/actions/itinerary.actions';
import { confirmItineraryImport } from '@/actions/itineraryImport.actions';
import { withNotePlanningTransaction } from '@/lib/notePlanningTransaction';
import { addTripPhotos, deletePhotos, updatePhoto } from '@/actions/photo.actions';
import { updateTrip } from '@/actions/trip.actions';
import { planNote } from '@/actions/note.actions';
import { buildPhotoObjectKeys } from '@/lib/uploads';
import { PHOTO_LIMIT_PER_TRIP } from '@/lib/validation';
import { readItinerary } from '@/lib/itineraryRead';
import {
  up as dayUp,
  down as dayDown,
} from '../../migrations/20260909120000-itinerary-day-revision.js';
import {
  up as activityUp,
  down as activityDown,
} from '../../migrations/20260909130000-itinerary-activity-revision.js';

const mocks = vi.hoisted(() => ({ session: vi.fn(), head: vi.fn(), cleanup: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: mocks.session }));
// The test owns the Mongoose connection. Never load dotenv or the application's URI.
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn(async () => undefined) }));
vi.mock('@/lib/storage', () => ({
  headObject: mocks.head,
  deleteObjects: mocks.cleanup,
  presignGet: vi.fn(),
  presignGetStable: vi.fn(async () => 'https://example.test/photo'),
}));
vi.mock('@/lib/photoItinerary', async (original) => ({
  ...(await original<typeof import('@/lib/photoItinerary')>()),
  rebindAutoPhotosToItinerary: vi.fn(async () => undefined),
}));
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const uri = process.env.MONGODB_ITINERARY_TEST_URI;
const allowed = process.env.MONGODB_ITINERARY_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Itinerary integration requires URI and write opt-in');

const admin = new mongoose.Types.ObjectId();
const secondAdmin = new mongoose.Types.ObjectId();
const member = new mongoose.Types.ObjectId();
const activity = (
  title = 'Activity',
  attachments: { key: string; content_type: string; size: number }[] = []
) => ({
  title,
  type: 'other' as const,
  time: null,
  end_time: null,
  note: '',
  confirmation_code: '',
  location_name: '',
  attachments,
});
const metadata = { size: 100, contentType: 'application/pdf' };

// Pause real action requests at external HEAD, after their snapshot reads but before Mongo writes.
function headBarrier(count: number) {
  let arrivals = 0;
  let release!: () => void;
  let ready!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    ready = resolve;
  });
  mocks.head.mockImplementation(async () => {
    if (++arrivals === count) ready();
    await released;
    return metadata;
  });
  return { entered, release };
}

describe.skipIf(!uri || !allowed)('itinerary actions against isolated MongoDB', () => {
  let owned = false;
  let tripId: string;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_itinerary_verify_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await ItineraryDay.createIndexes();
    await blobUp(db);
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ userId: admin.toHexString() });
    mocks.head.mockResolvedValue(metadata);
    mocks.cleanup.mockResolvedValue(undefined);
    await Promise.all([ItineraryDay.deleteMany({}), Note.deleteMany({}), Trip.deleteMany({})]);
    const trip = await Trip.create({
      name: 'Test',
      hashCode: 'r2verify',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-14'),
      members: [
        { user: admin, role: 'admin' },
        { user: secondAdmin, role: 'admin' },
        { user: member, role: 'member' },
      ],
    });
    tripId = trip.id;
  });
  async function seedPhoto() {
    return mongoose.connection.db!.collection('photos').insertOne({
      trip: new mongo.ObjectId(tripId),
      uploadedBy: member,
      ...buildPhotoObjectKeys(tripId),
      contentType: 'image/jpeg',
      size: 100,
      caption: 'Original',
      location: null,
      itineraryDay: null,
      createdAt: new Date(),
    });
  }

  async function sharedTicket() {
    const key = `itinerary/${tripId}/${randomUUID()}.pdf`;
    const attachment = { key, ...metadata, uploadedBy: admin, uploadedAt: new Date() };
    const first = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 1,
      title: 'First',
      activities: [{ title: 'Ticket', attachments: [attachment] }],
    });
    const second = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 2,
      title: 'Second',
      activities: [{ title: 'Ticket', attachments: [attachment] }],
    });
    return { key, first, second };
  }
  it.each(['day', 'activity', 'wholeDay'])(
    'preserves cross-day ticket references on %s removal and retires the final reference',
    async (kind) => {
      const { key, first, second } = await sharedTicket();
      if (kind === 'day')
        expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ success: true });
      else if (kind === 'wholeDay')
        expect(
          await updateItineraryDay(tripId, first.id, { expected_revision: 0, activities: [] })
        ).toMatchObject({ success: true });
      else
        expect(
          await mutateItineraryActivity(tripId, first.id, {
            operation: 'delete',
            activity_id: first.activities[0]._id.toString(),
            expected_activity_revision: 0,
          })
        ).toMatchObject({ success: true });
      expect(mocks.cleanup).not.toHaveBeenCalled();
      const jobs = mongoose.connection.db!.collection<{ _id: string }>('blobcleanupjobs');
      expect(await jobs.findOne({ _id: key })).toBeNull();
      expect(await deleteItineraryDay(tripId, second.id)).toMatchObject({ success: true });
      expect(await jobs.findOne({ _id: key })).toHaveProperty('firstSweepAt');
      expect(mocks.cleanup).toHaveBeenCalledWith('receipts', [key], expect.any(AbortSignal));
    }
  );
  it('rejects a ticket re-reference whose HEAD completed before final deletion', async () => {
    const { key, first, second } = await sharedTicket();
    await deleteItineraryDay(tripId, second.id);
    const target = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 2,
      title: 'Target',
      activities: [],
    });
    const barrier = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, target.id, {
      operation: 'add',
      activity: activity('Reused', [
        { key, content_type: metadata.contentType, size: metadata.size },
      ]),
    });
    await barrier.entered;
    await deleteItineraryDay(tripId, first.id);
    barrier.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect((await ItineraryDay.findById(target.id))!.activities).toHaveLength(0);
  });
  it('keeps a ticket when a new reference commits before final deletion', async () => {
    const { key, first, second } = await sharedTicket();
    await deleteItineraryDay(tripId, second.id);
    expect(
      await createItineraryDay(tripId, {
        title: 'New ref',
        activities: [
          activity('Ticket', [{ key, content_type: metadata.contentType, size: metadata.size }]),
        ],
      })
    ).toMatchObject({ success: true });
    await deleteItineraryDay(tripId, first.id);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('rolls back removed references and tombstones if enqueue fails after writing', async () => {
    const { key, first, second } = await sharedTicket();
    await deleteItineraryDay(tripId, second.id);
    const original = mongo.Collection.prototype.bulkWrite;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'bulkWrite')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'blobcleanupjobs') throw new Error('Injected enqueue failure');
        return result;
      });
    try {
      expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ code: 'INTERNAL_ERROR' });
    } finally {
      spy.mockRestore();
    }
    expect(await ItineraryDay.findById(first.id)).not.toBeNull();
    expect(
      await mongoose.connection
        .db!.collection<{ _id: string }>('blobcleanupjobs')
        .findOne({ _id: key })
    ).toBeNull();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('retries failed storage cleanup and rescans late uploads before retaining a tombstone', async () => {
    const { key, first, second } = await sharedTicket();
    await deleteItineraryDay(tripId, second.id);
    mocks.cleanup.mockRejectedValueOnce(new Error('R2 unavailable'));
    expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ success: true });
    const db = mongoose.connection.db!;
    const jobs = db.collection<{ _id: string; availableAt: Date; firstSweepAt?: Date }>(
      'blobcleanupjobs'
    );
    const job = (await jobs.findOne({ _id: key }))!;
    expect(job.firstSweepAt).toBeUndefined();
    const remove = vi.fn(async (_keys: string[]) => undefined);
    expect(await runBlobCleanup(db, remove, { keys: [key], now: job.availableAt })).toMatchObject({
      status: 'cleaned',
    });
    const swept = (await jobs.findOne({ _id: key }))!;
    expect(swept.firstSweepAt).toEqual(job.availableAt);
    expect(swept.availableAt.getTime() - swept.firstSweepAt!.getTime()).toBe(24 * 60 * 60_000);
    await runBlobCleanup(db, remove, { keys: [key], now: swept.availableAt });
    expect(await jobs.findOne({ _id: key })).toHaveProperty('completedAt');
    expect(
      await createItineraryDay(tripId, {
        title: 'Reused',
        activities: [
          activity('Reused', [{ key, content_type: metadata.contentType, size: metadata.size }]),
        ],
      })
    ).toMatchObject({ code: 'CONFLICT' });
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('prevents expired cleanup workers from overwriting a newer lease', async () => {
    const db = mongoose.connection.db!;
    const key = `itinerary/${tripId}/lease.pdf`;
    const now = new Date();
    const jobs = db.collection<{ _id: string; availableAt: Date; token?: string }>(
      'blobcleanupjobs'
    );
    await jobs.insertOne({ _id: key, availableAt: now });
    let entered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const first = runBlobCleanup(
      db,
      async () => {
        entered();
        await wait;
      },
      { keys: [key], now }
    );
    await ready;
    const later = new Date(now.getTime() + 6 * 60_000);
    expect(
      await runBlobCleanup(
        db,
        async () => {
          throw new Error('Retry');
        },
        { keys: [key], now: later }
      )
    ).toMatchObject({ status: 'retry' });
    const checkpoint = await jobs.findOne({ _id: key });
    release();
    await first;
    expect(await jobs.findOne({ _id: key })).toEqual(checkpoint);
  });
  it('bounds cleanup batches and preserves jobs across migration replays and rollback', async () => {
    const db = mongoose.connection.db!;
    const keys = Array.from({ length: 51 }, () => `itinerary/${tripId}/${randomUUID()}.pdf`);
    const jobs = db.collection<{ _id: string; availableAt: Date }>('blobcleanupjobs');
    await jobs.insertMany(keys.map((key) => ({ _id: key, availableAt: new Date(0) })));
    await blobUp(db);
    await blobUp(db);
    const remove = vi.fn(async (_keys: string[]) => undefined);
    await runBlobCleanup(db, remove, { keys });
    expect(remove.mock.calls[0][0]).toHaveLength(50);
    await blobDown(db);
    await blobDown(db);
    expect(await jobs.countDocuments({ _id: { $in: keys } })).toBe(51);
    await blobUp(db);
  });

  function photoInput() {
    const { key, thumbKey } = buildPhotoObjectKeys(tripId);
    return {
      items: [
        {
          key,
          thumb_key: thumbKey,
          taken_local_date: '2026-09-01',
          taken_date_source: 'exif' as const,
        },
      ],
    };
  }
  function photoHeads() {
    mocks.head.mockImplementation(async (_bucket: string, key: string) => ({
      size: 100,
      contentType: key.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
    }));
  }
  it('serializes uploads at the last album slot', async () => {
    photoHeads();
    const photos = mongoose.connection.db!.collection('photos');
    await photos.insertMany(
      Array.from({ length: PHOTO_LIMIT_PER_TRIP - 1 }, () => ({
        trip: new mongo.ObjectId(tripId),
        key: randomUUID(),
      }))
    );
    const results = await Promise.all([
      addTripPhotos('r2verify', photoInput()),
      addTripPhotos(tripId, photoInput()),
    ]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success && r.code === 'CONFLICT')).toHaveLength(1);
    expect(await photos.countDocuments({ trip: new mongo.ObjectId(tripId) })).toBe(
      PHOTO_LIMIT_PER_TRIP
    );
  });
  it('rolls back the entire photo batch after a late insert failure', async () => {
    photoHeads();
    const original = mongo.Collection.prototype.insertMany;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'insertMany')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'photos') throw new Error('Injected photo insert failure');
        return result;
      });
    try {
      expect(await addTripPhotos(tripId, photoInput())).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(
        await mongoose.connection
          .db!.collection('photos')
          .countDocuments({ trip: new mongo.ObjectId(tripId) })
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(await addTripPhotos(tripId, photoInput())).toMatchObject({ success: true });
  });
  it.each(['removed', 'deleting', 'deleted', 'dayDeleted'])(
    'rechecks photo upload state after HEAD: %s',
    async (change) => {
      const day = await seed();
      let changed = false;
      mocks.head.mockImplementation(async (_bucket: string, key: string) => {
        if (!changed) {
          changed = true;
          if (change === 'removed')
            await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: admin } } });
          if (change === 'deleting')
            await Trip.updateOne({ _id: tripId }, { $set: { expenseDeliveryDeleting: true } });
          if (change === 'deleted') await Trip.deleteOne({ _id: tripId });
          if (change === 'dayDeleted') await ItineraryDay.deleteOne({ _id: day._id });
        }
        return { size: 100, contentType: key.endsWith('.webp') ? 'image/webp' : 'image/jpeg' };
      });
      const result = await addTripPhotos(tripId, photoInput());
      if (change === 'dayDeleted')
        expect(result).toMatchObject({ success: true, data: [{ itinerary_day_id: null }] });
      else expect(result).toMatchObject({ code: 'FORBIDDEN' });
    }
  );

  it('deletes member photos before cleaning blobs and preserves foreign photos', async () => {
    const photo = await seedPhoto();
    const foreign = await seedPhoto();
    const photos = mongoose.connection.db!.collection('photos');
    await photos.updateOne({ _id: foreign.insertedId }, { $set: { trip: new mongo.ObjectId() } });
    mocks.session.mockResolvedValue({ userId: member.toHexString() });
    let deletedBeforeCleanup = false;
    mocks.cleanup.mockImplementationOnce(async () => {
      deletedBeforeCleanup = (await photos.findOne({ _id: photo.insertedId })) === null;
      throw new Error('R2 unavailable');
    });
    expect(
      await deletePhotos('r2verify', {
        photo_ids: [photo.insertedId.toHexString(), foreign.insertedId.toHexString()],
      })
    ).toMatchObject({ success: true, data: { deleted: 1 } });
    expect(deletedBeforeCleanup).toBe(true);
    expect(await photos.findOne({ _id: foreign.insertedId })).not.toBeNull();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it('rolls back a late photo deletion failure without deleting blobs', async () => {
    const photo = await seedPhoto();
    const db = mongoose.connection.db!;
    const before = await db.collection('trips').findOne({ _id: new mongo.ObjectId(tripId) });
    const original = mongo.Collection.prototype.deleteMany;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'deleteMany')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'photos') throw new Error('Injected deletion failure');
        return result;
      });
    try {
      expect(
        await deletePhotos(tripId, { photo_ids: [photo.insertedId.toHexString()] })
      ).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(await db.collection('photos').findOne({ _id: photo.insertedId })).not.toBeNull();
      expect(
        (await db.collection('trips').findOne({ _id: new mongo.ObjectId(tripId) }))!
          .expenseDeliveryFence
      ).toBe(before!.expenseDeliveryFence);
      expect(mocks.cleanup).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(
      await deletePhotos(tripId, { photo_ids: [photo.insertedId.toHexString()] })
    ).toMatchObject({ success: true });
  });

  it.each(['removed', 'deleting', 'deleted'])(
    'rejects photo deletion when %s after initial authorization',
    async (change) => {
      const photo = await seedPhoto();
      const db = mongoose.connection.db!;
      const trip = new mongo.ObjectId(tripId);
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let changed = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'trips' && !changed) {
            changed = true;
            if (change === 'removed')
              await db.collection('trips').updateOne({ _id: trip }, {
                $pull: { members: { user: admin } },
              } as mongo.Document);
            else if (change === 'deleted') await db.collection('trips').deleteOne({ _id: trip });
            else
              await db
                .collection('trips')
                .updateOne({ _id: trip }, { $set: { expenseDeliveryDeleting: true } });
          }
          return original.apply(this, args);
        });
      try {
        expect(
          await deletePhotos(tripId, { photo_ids: [photo.insertedId.toHexString()] })
        ).toMatchObject({ code: 'FORBIDDEN' });
        expect(await db.collection('photos').findOne({ _id: photo.insertedId })).not.toBeNull();
        expect(mocks.cleanup).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('only cleans blobs once when two photo deletions race', async () => {
    const photo = await seedPhoto();
    const input = { photo_ids: [photo.insertedId.toHexString()] };
    const results = await Promise.all([deletePhotos(tripId, input), deletePhotos(tripId, input)]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)).toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it('allows an ordinary member to classify a photo and borrow day coordinates', async () => {
    const day = await seed();
    await ItineraryDay.updateOne(
      { _id: day._id },
      { $set: { location: { name: 'Tokyo', lat: 35, lon: 139 } } }
    );
    const photo = await seedPhoto();
    mocks.session.mockResolvedValue({ userId: member.toHexString() });
    expect(
      await updatePhoto('r2verify', photo.insertedId.toHexString(), {
        itinerary_day_id: day._id.toString(),
      })
    ).toMatchObject({ success: true });
    expect(
      await mongoose.connection.db!.collection('photos').findOne({ _id: photo.insertedId })
    ).toMatchObject({
      itineraryDay: day._id,
      itineraryDaySource: 'manual',
      location: { lat: 35, lon: 139, source: 'itinerary' },
    });
  });

  it('rolls back photo edits and the trip fence on a late database failure, then retries', async () => {
    const photo = await seedPhoto();
    const db = mongoose.connection.db!;
    const before = await db.collection('trips').findOne({ _id: new mongo.ObjectId(tripId) });
    const original = mongo.Collection.prototype.findOneAndUpdate;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'photos') throw new Error('Injected photo failure');
        return result;
      });
    try {
      expect(
        await updatePhoto(tripId, photo.insertedId.toHexString(), { caption: 'Changed' })
      ).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(await db.collection('photos').findOne({ _id: photo.insertedId })).toMatchObject({
        caption: 'Original',
      });
      expect(
        (await db.collection('trips').findOne({ _id: new mongo.ObjectId(tripId) }))!
          .expenseDeliveryFence
      ).toBe(before!.expenseDeliveryFence);
    } finally {
      spy.mockRestore();
    }
    expect(
      await updatePhoto(tripId, photo.insertedId.toHexString(), { caption: 'Changed' })
    ).toMatchObject({ success: true });
  });

  it.each(['removed', 'deleting', 'deleted', 'day_deleted'])(
    'rejects a photo edit when %s after initial authorization',
    async (change) => {
      const day = await seed();
      const photo = await seedPhoto();
      const db = mongoose.connection.db!;
      const trip = new mongo.ObjectId(tripId);
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let changed = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'trips' && !changed) {
            changed = true;
            if (change === 'removed')
              await db.collection('trips').updateOne({ _id: trip }, {
                $pull: { members: { user: admin } },
              } as mongo.Document);
            else if (change === 'deleted') await db.collection('trips').deleteOne({ _id: trip });
            else if (change === 'deleting')
              await db
                .collection('trips')
                .updateOne({ _id: trip }, { $set: { expenseDeliveryDeleting: true } });
            else await ItineraryDay.deleteOne({ _id: day._id });
          }
          return original.apply(this, args);
        });
      try {
        expect(
          await updatePhoto(tripId, photo.insertedId.toHexString(), {
            caption: 'Changed',
            itinerary_day_id: day._id.toString(),
          })
        ).toMatchObject({ code: change === 'day_deleted' ? 'NOT_FOUND' : 'FORBIDDEN' });
        expect(await db.collection('photos').findOne({ _id: photo.insertedId })).toMatchObject({
          caption: 'Original',
          itineraryDay: null,
        });
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('leaves no dangling photo relation when classification races with day deletion', async () => {
    const day = await seed();
    const photo = await seedPhoto();
    const [edited, deleted] = await Promise.all([
      updatePhoto(tripId, photo.insertedId.toHexString(), { itinerary_day_id: day._id.toString() }),
      deleteItineraryDay(tripId, day._id.toString()),
    ]);
    expect(deleted.success).toBe(true);
    if (!edited.success) expect(edited.code).toBe('NOT_FOUND');
    expect(
      await mongoose.connection.db!.collection('photos').findOne({ _id: photo.insertedId })
    ).toMatchObject({ itineraryDay: null, location: null });
  });

  it('rolls back trip dates and metadata when photo rebinding fails, then retries successfully', async () => {
    const day = await seed();
    const db = mongoose.connection.db!;
    const trip = new mongo.ObjectId(tripId);
    const photo = await db.collection('photos').insertOne({
      trip,
      itineraryDay: day._id,
      itineraryDaySource: 'auto',
      takenLocalDate: '2026-09-01',
      location: null,
    });
    const original = mongo.Collection.prototype.bulkWrite;
    const spy = vi.spyOn(mongo.Collection.prototype, 'bulkWrite').mockImplementation(function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'photos') throw new Error('Injected rebind failure');
      return original.apply(this, args);
    });
    try {
      expect(
        await updateTrip('r2verify', { start_date: '2026-09-02', name: 'Changed' })
      ).toMatchObject({ code: 'INTERNAL_ERROR' });
      expect(await Trip.findById(trip).lean()).toMatchObject({
        name: 'Test',
        startDate: new Date('2026-09-01'),
      });
      expect(
        (await db.collection('photos').findOne({ _id: photo.insertedId }))!.itineraryDay
      ).toEqual(day._id);
    } finally {
      spy.mockRestore();
    }
    expect(await updateTrip(tripId, { start_date: '2026-09-02', name: 'Changed' })).toMatchObject({
      success: true,
    });
    expect(
      (await db.collection('photos').findOne({ _id: photo.insertedId }))!.itineraryDay
    ).toBeNull();
  });

  it('prevents concurrent partial date edits from producing an inverted range', async () => {
    const results = await Promise.all([
      updateTrip(tripId, { start_date: '2026-09-10' }),
      updateTrip('r2verify', { end_date: '2026-09-05' }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)).toMatchObject({ code: 'VALIDATION_ERROR' });
    const trip = await Trip.findById(tripId).lean();
    expect(trip!.startDate!.getTime()).toBeLessThanOrEqual(trip!.endDate!.getTime());
  });

  it.each(['demoted', 'deleting', 'deleted'])(
    'rejects trip metadata writes when %s after initial authorization',
    async (change) => {
      const db = mongoose.connection.db!;
      const trip = new mongo.ObjectId(tripId);
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let changed = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'trips' && !changed) {
            changed = true;
            if (change === 'deleted') await db.collection('trips').deleteOne({ _id: trip });
            else if (change === 'deleting')
              await db
                .collection('trips')
                .updateOne({ _id: trip }, { $set: { expenseDeliveryDeleting: true } });
            else
              await db
                .collection('trips')
                .updateOne(
                  { _id: trip, 'members.user': admin },
                  { $set: { 'members.$.role': 'member' } }
                );
          }
          return original.apply(this, args);
        });
      try {
        expect(await updateTrip(tripId, { name: 'Forbidden change' })).toMatchObject({
          code: 'FORBIDDEN',
        });
        expect(await Trip.countDocuments({ _id: trip, name: 'Forbidden change' })).toBe(0);
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('rolls back day, revision and borrowed photo writes if the final rebind fails', async () => {
    const day = await seed();
    const db = mongoose.connection.db!;
    const trip = new mongo.ObjectId(tripId);
    const ticketKey = `itinerary/${tripId}/removed.pdf`;
    await ItineraryDay.updateOne(
      { _id: day._id },
      {
        $set: {
          'activities.0.attachments': [
            {
              key: ticketKey,
              contentType: 'application/pdf',
              size: 100,
              uploadedBy: admin,
              uploadedAt: new Date(),
            },
          ],
        },
      }
    );

    await db.collection('photos').insertMany([
      {
        trip,
        caption: 'auto',
        itineraryDay: day._id,
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: null,
      },
      {
        trip,
        caption: 'manual',
        itineraryDay: day._id,
        itineraryDaySource: 'manual',
        location: null,
      },
      {
        trip,
        caption: 'gps',
        itineraryDay: day._id,
        itineraryDaySource: 'manual',
        location: { lat: 1, lon: 2, source: 'exif' },
      },
    ]);
    const input = {
      expected_revision: 0,
      activities: [],
      title: 'Changed',
      day_number: 2,
      location: { name: 'Tokyo', display_name: 'Tokyo', lat: 35, lon: 139 },
    };
    const original = mongo.Collection.prototype.bulkWrite;
    const spy = vi.spyOn(mongo.Collection.prototype, 'bulkWrite').mockImplementation(function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'photos') throw new Error('final rebind failed');
      return original.apply(this, args);
    });
    try {
      expect(await updateItineraryDay('r2verify', day.id, input)).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
      expect(await ItineraryDay.findById(day.id).lean()).toMatchObject({
        title: 'Day',
        dayNumber: 1,
        revision: 0,
      });
      expect((await db.collection('photos').findOne({ caption: 'manual' }))?.location).toBeNull();
      expect(mocks.cleanup).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(await updateItineraryDay('r2verify', day.id, input)).toMatchObject({ success: true });
    expect(mocks.cleanup).toHaveBeenCalledWith('receipts', [ticketKey], expect.any(AbortSignal));
    const auto = await db.collection('photos').findOne({ caption: 'auto' });
    expect(auto?.itineraryDay).toBeNull();
    expect(auto?.location).toBeNull();
    const manual = await db.collection('photos').findOne({ caption: 'manual' });
    expect(manual?.itineraryDay.toString()).toBe(day.id);
    expect(manual?.location).toEqual({ lat: 35, lon: 139, source: 'itinerary' });
    expect((await db.collection('photos').findOne({ caption: 'gps' }))?.location).toEqual({
      lat: 1,
      lon: 2,
      source: 'exif',
    });
    expect(
      await updateItineraryDay(tripId, day.id, { expected_revision: 1, location: null })
    ).toMatchObject({ success: true });
    expect((await db.collection('photos').findOne({ caption: 'manual' }))?.location).toBeNull();
  });

  it('rejects a day update if admin access is revoked during attachment verification', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = updateItineraryDay(tripId, day.id, {
      expected_revision: 0,
      activities: [{ ...uploaded('Late'), id: day.activities[0]._id.toString() }],
    });
    await gate.entered;
    try {
      await Trip.updateOne(
        { _id: tripId, 'members.user': admin },
        { $set: { 'members.$.role': 'member' } }
      );
    } finally {
      gate.release();
    }
    expect(await pending).toMatchObject({ code: 'FORBIDDEN' });
    expect((await ItineraryDay.findById(day.id))?.revision).toBe(0);
    expect(mocks.head).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it('allows only one concurrent whole-day update at the same revision', async () => {
    const day = await seed();
    const results = await Promise.all(
      ['A', 'B'].map((title) => updateItineraryDay(tripId, day.id, { expected_revision: 0, title }))
    );
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toEqual([
      expect.objectContaining({ code: 'CONFLICT' }),
    ]);
    expect((await ItineraryDay.findById(day.id))?.revision).toBe(1);
  });

  it('serializes concurrent creates and deletion, allocating contiguous day numbers', async () => {
    const first = await seed();
    const results = await Promise.all([
      ...Array.from({ length: 4 }, (_, i) => createItineraryDay('r2verify', { title: `New ${i}` })),
      deleteItineraryDay(tripId, first.id),
    ]);
    expect(results.every((result) => result.success)).toBe(true);
    const days = await ItineraryDay.find({ trip: tripId }).sort({ dayNumber: 1 }).lean();
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4]);
  });

  it('rolls back creation when photo rebind fails, then creates and binds successfully', async () => {
    const db = mongoose.connection.db!;
    const trip = new mongo.ObjectId(tripId);
    await db.collection('photos').insertMany([
      {
        trip,
        caption: 'auto',
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: null,
      },
      {
        trip,
        caption: 'gps',
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: { lat: 1, lon: 2, source: 'exif' },
      },
      {
        trip,
        caption: 'manual',
        itineraryDaySource: 'manual',
        takenLocalDate: '2026-09-01',
        itineraryDay: null,
      },
    ]);
    const original = mongo.Collection.prototype.bulkWrite;
    const spy = vi.spyOn(mongo.Collection.prototype, 'bulkWrite').mockImplementation(function (
      this: mongo.Collection,
      ...args
    ) {
      if (this.collectionName === 'photos') throw new Error('photo write failed');
      return original.apply(this, args);
    });
    try {
      expect(
        await createItineraryDay(tripId, {
          title: 'New',
          location: { name: 'Tokyo', display_name: 'Tokyo', lat: 35, lon: 139 },
        })
      ).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
      expect(await ItineraryDay.countDocuments({ trip })).toBe(0);
      expect(
        (await db.collection('photos').findOne({ trip, caption: 'auto' }))?.location
      ).toBeNull();
    } finally {
      spy.mockRestore();
    }
    const result = await createItineraryDay(tripId, {
      title: 'New',
      location: { name: 'Tokyo', display_name: 'Tokyo', lat: 35, lon: 139 },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('create failed');
    const auto = await db.collection('photos').findOne({ trip, caption: 'auto' });
    expect(auto?.itineraryDay.toString()).toBe(result.data.id);
    expect(auto?.location).toEqual({ lat: 35, lon: 139, source: 'itinerary' });
    expect((await db.collection('photos').findOne({ trip, caption: 'gps' }))?.location).toEqual({
      lat: 1,
      lon: 2,
      source: 'exif',
    });
    expect(
      (await db.collection('photos').findOne({ trip, caption: 'manual' }))?.itineraryDay
    ).toBeNull();
  });

  it('rechecks admin authorization after attachment verification', async () => {
    const barrier = headBarrier(1);
    const pending = createItineraryDay(tripId, {
      title: 'Late',
      activities: [
        activity('Ticket', [
          { key: `itinerary/${tripId}/late.pdf`, content_type: 'application/pdf', size: 100 },
        ]),
      ],
    });
    await barrier.entered;
    try {
      await Trip.updateOne(
        { _id: tripId, 'members.user': admin },
        { $set: { 'members.$.role': 'member' } }
      );
    } finally {
      barrier.release();
    }
    expect(await pending).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(await ItineraryDay.countDocuments({ trip: tripId })).toBe(0);
    expect(mocks.head).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it('atomically renumbers and rebinds photos while preserving manual choices, GPS and other trip data', async () => {
    const db = mongoose.connection.db!;
    const first = await seed();
    const second = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 2,
      title: 'Second',
      location: { lat: 35, lon: 139 },
    });
    const third = await ItineraryDay.create({ trip: tripId, dayNumber: 3, title: 'Third' });
    const trip = new mongo.ObjectId(tripId);
    const other = new mongo.ObjectId();
    await db.collection('expenses').insertMany([
      { trip, itineraryDays: [first._id, second._id] },
      { trip: other, itineraryDays: [first._id] },
    ]);
    await db.collection('photos').insertMany([
      {
        trip,
        caption: 'auto',
        itineraryDay: first._id,
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: { lat: 1, lon: 2, source: 'itinerary' },
      },
      {
        trip,
        caption: 'manual',
        itineraryDay: first._id,
        itineraryDaySource: 'manual',
        location: { lat: 1, lon: 2, source: 'itinerary' },
      },
      {
        trip,
        caption: 'gps',
        itineraryDay: first._id,
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: { lat: 9, lon: 8, source: 'exif' },
      },
      {
        trip,
        caption: 'out',
        itineraryDay: third._id,
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-03',
        location: { lat: 1, lon: 2, source: 'itinerary' },
      },
      { trip: other, caption: 'other', itineraryDay: first._id, location: { source: 'itinerary' } },
    ]);
    expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ success: true });
    const remaining = await ItineraryDay.find({ trip }).sort({ dayNumber: 1 }).lean();
    expect(remaining.map((d) => [d.dayNumber, d.revision])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect((await db.collection('expenses').findOne({ trip }))?.itineraryDays).toEqual([
      second._id,
    ]);
    expect((await db.collection('expenses').findOne({ trip: other }))?.itineraryDays).toEqual([
      first._id,
    ]);
    expect(await db.collection('photos').findOne({ trip, caption: 'auto' })).toMatchObject({
      itineraryDay: second._id,
      location: { lat: 35, lon: 139, source: 'itinerary' },
    });
    expect(await db.collection('photos').findOne({ trip, caption: 'manual' })).toMatchObject({
      itineraryDay: null,
      itineraryDaySource: 'manual',
      location: null,
    });
    expect(await db.collection('photos').findOne({ trip, caption: 'gps' })).toMatchObject({
      itineraryDay: second._id,
      location: { lat: 9, lon: 8, source: 'exif' },
    });
    expect(await db.collection('photos').findOne({ trip, caption: 'out' })).toMatchObject({
      itineraryDay: null,
      location: null,
    });
    expect(await db.collection('photos').findOne({ trip: other })).toMatchObject({
      itineraryDay: first._id,
      location: { source: 'itinerary' },
    });
  });

  it('rolls back deletion, expense cleanup and renumbering when the final photo rebind fails', async () => {
    const db = mongoose.connection.db!;
    const first = await seed();
    await ItineraryDay.create({ trip: tripId, dayNumber: 2, title: 'Second' });
    const trip = new mongo.ObjectId(tripId);
    await db.collection('expenses').insertOne({ trip, itineraryDays: [first._id] });
    await db.collection('photos').insertOne({
      trip,
      itineraryDay: first._id,
      itineraryDaySource: 'auto',
      takenLocalDate: '2026-09-01',
    });
    const original = mongo.Collection.prototype.bulkWrite;
    const spy = vi.spyOn(mongo.Collection.prototype, 'bulkWrite').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'photos') throw new Error('injected late failure');
      return original.apply(this, args);
    });
    try {
      expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ code: 'INTERNAL_ERROR' });
    } finally {
      spy.mockRestore();
    }
    expect(
      (await ItineraryDay.find({ trip }).sort({ dayNumber: 1 }).lean()).map((d) => [
        d.dayNumber,
        d.revision,
      ])
    ).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect((await db.collection('expenses').findOne({ trip }))?.itineraryDays).toEqual([first._id]);
    expect((await db.collection('photos').findOne({ trip }))?.itineraryDay).toEqual(first._id);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it('serializes concurrent day deletions with contiguous numbering and rejects stale admins', async () => {
    const db = mongoose.connection.db!;
    const first = await seed();
    const second = await ItineraryDay.create({ trip: tripId, dayNumber: 2, title: 'Second' });
    await ItineraryDay.create({ trip: tripId, dayNumber: 3, title: 'Third' });
    const results = await Promise.all([first, second].map((d) => deleteItineraryDay(tripId, d.id)));
    expect(results.every((r) => r.success)).toBe(true);
    expect((await ItineraryDay.find({ trip: tripId }).lean()).map((d) => d.dayNumber)).toEqual([1]);
    await expect(
      deleteItineraryDayAtomically(db, tripId, member.toHexString(), first.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      deleteItineraryDayAtomically(db, tripId, admin.toHexString(), first.id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  async function seed(count = 2) {
    return ItineraryDay.create({
      trip: tripId,
      dayNumber: 1,
      title: 'Day',
      activities: Array.from({ length: count }, (_, i) => ({ title: `Original ${i}` })),
    });
  }
  function uploaded(title: string) {
    return activity(title, [
      {
        key: `itinerary/${tripId}/${randomUUID()}.pdf`,
        content_type: 'application/pdf',
        size: 100,
      },
    ]);
  }
  function importDraft(count = 1) {
    return {
      operationId: randomUUID(),
      draft: {
        days: [
          {
            date: '2026-09-01',
            title: 'Imported day',
            activities: Array.from({ length: count }, (_, i) => ({
              title: `AI ${i}`,
              type: 'other',
            })),
          },
        ],
        warnings: [],
      },
    };
  }

  it('initializes server identities and revisions through manual day creation and append', async () => {
    const created = await createItineraryDay('r2verify', {
      title: 'Day',
      activities: [activity()],
    });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error(created.code);
    expect(created.data.revision).toBe(0);
    expect(created.data.activities[0]).toMatchObject({
      revision: 0,
      id: expect.stringMatching(/^[a-f0-9]{24}$/),
    });
    const added = await mutateItineraryActivity(tripId, created.data.id, {
      operation: 'add',
      activity: activity('New'),
    });
    expect(added).toMatchObject({
      success: true,
      data: { revision: 1, activities: [{ revision: 0 }, { revision: 0 }] },
    });
  });

  it.each([true, false])(
    'serializes same-target edits and preserves different-target edits (%s)',
    async (sameTarget) => {
      const day = await seed();
      const gate = headBarrier(2);
      mocks.session
        .mockResolvedValueOnce({ userId: admin.toHexString() })
        .mockResolvedValueOnce({ userId: secondAdmin.toHexString() });
      const pending = Promise.all(
        [0, sameTarget ? 0 : 1].map((index, i) =>
          mutateItineraryActivity(tripId, day.id, {
            operation: 'update',
            activity_id: day.activities[index]._id.toString(),
            expected_activity_revision: 0,
            activity: uploaded(`Edited ${i}`),
          })
        )
      );
      await gate.entered;
      gate.release();
      const results = await pending;
      expect(results.filter((r) => r.success)).toHaveLength(sameTarget ? 1 : 2);
      if (sameTarget) expect(results.find((r) => !r.success)).toMatchObject({ code: 'CONFLICT' });
      const stored = await ItineraryDay.findById(day.id).lean();
      expect(stored!.revision).toBe(sameTarget ? 1 : 2);
      expect(stored!.activities.map((a) => a.revision)).toEqual(sameTarget ? [1, 0] : [1, 1]);
      expect(stored!.activities.map((a) => a._id.toString())).toEqual(
        day.activities.map((a) => a._id.toString())
      );
      if (!sameTarget)
        expect(stored!.activities.map((a) => a.title)).toEqual(['Edited 0', 'Edited 1']);
    }
  );

  it.each([0, 14])(
    'enforces capacity under simultaneous manual appends from %i activities',
    async (count) => {
      const day = await seed(count);
      const gate = headBarrier(2);
      const pending = Promise.all(
        [0, 1].map((i) =>
          mutateItineraryActivity(tripId, day.id, {
            operation: 'add',
            activity: uploaded(`New ${i}`),
          })
        )
      );
      await gate.entered;
      gate.release();
      const results = await pending;
      expect(results.filter((r) => r.success)).toHaveLength(count === 14 ? 1 : 2);
      const stored = await ItineraryDay.findById(day.id).lean();
      expect(stored!.activities).toHaveLength(count === 14 ? 15 : 2);
      expect(new Set(stored!.activities.map((a) => a._id.toString())).size).toBe(
        stored!.activities.length
      );
      expect(stored!.activities.every((a) => a.revision === 0)).toBe(true);
    }
  );

  it('matches ID and revision on the same element even when a sibling has the requested revision', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, day.id, {
      operation: 'update',
      activity_id: day.activities[0]._id.toString(),
      expected_activity_revision: 0,
      activity: uploaded('Stale'),
    });
    await gate.entered;
    await ItineraryDay.updateOne(
      { _id: day.id },
      { $inc: { 'activities.0.revision': 1, revision: 1 } }
    );
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect((await ItineraryDay.findById(day.id))!.activities[0].title).toBe('Original 0');
  });

  it('does not resurrect an activity deleted while attachment validation is pending', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const input = { activity_id: day.activities[0]._id.toString(), expected_activity_revision: 0 };
    const pending = mutateItineraryActivity(tripId, day.id, {
      ...input,
      operation: 'update',
      activity: uploaded('Stale'),
    });
    await gate.entered;
    expect(
      await mutateItineraryActivity(tripId, day.id, { ...input, operation: 'delete' })
    ).toMatchObject({ success: true });
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect((await ItineraryDay.findById(day.id))!.activities.map((a) => a._id.toString())).toEqual([
      day.activities[1]._id.toString(),
    ]);
  });

  it('invalidates pending single edits when a whole-array replacement wins', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, day.id, {
      operation: 'update',
      activity_id: day.activities[0]._id.toString(),
      expected_activity_revision: 0,
      activity: uploaded('Stale'),
    });
    await gate.entered;
    const bulk = await updateItineraryDay(tripId, day.id, {
      expected_revision: 0,
      activities: [
        ...day.activities.map((a) => ({ ...activity('Bulk'), id: a._id.toString() })),
        { ...activity('New'), id: null },
      ],
    });
    expect(bulk).toMatchObject({
      success: true,
      data: { activities: [{ revision: 1 }, { revision: 1 }, { revision: 0 }] },
    });
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a pending whole-array replacement when a single edit wins', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = updateItineraryDay(tripId, day.id, {
      expected_revision: 0,
      activities: [{ ...uploaded('Stale bulk'), id: day.activities[0]._id.toString() }],
    });
    await gate.entered;
    expect(
      await mutateItineraryActivity(tripId, day.id, {
        operation: 'update',
        activity_id: day.activities[1]._id.toString(),
        expected_activity_revision: 0,
        activity: activity('Winner'),
      })
    ).toMatchObject({ success: true });
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect((await ItineraryDay.findById(day.id))!.activities.map((a) => a.title)).toEqual([
      'Original 0',
      'Winner',
    ]);
  });

  it('preserves a newer timestamp when a slow sibling edit completes', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, day.id, {
      operation: 'update',
      activity_id: day.activities[0]._id.toString(),
      expected_activity_revision: 0,
      activity: uploaded('Slow'),
    });
    await gate.entered;
    const future = new Date('2099-01-01');
    await ItineraryDay.updateOne(
      { _id: day.id },
      { $set: { updatedAt: future }, $inc: { revision: 1 } },
      { timestamps: false }
    );
    gate.release();
    expect(await pending).toMatchObject({ success: true });
    expect((await ItineraryDay.findById(day.id))!.updatedAt).toEqual(future);
  });

  it.each(['demoted', 'deleting', 'deleted'] as const)(
    'rejects a pending activity write when its trip is %s during HEAD',
    async (state) => {
      const day = await seed();
      const gate = headBarrier(1);
      const pending = mutateItineraryActivity(tripId, day.id, {
        operation: 'update',
        activity_id: day.activities[0]._id.toString(),
        expected_activity_revision: 0,
        activity: uploaded('Unauthorized'),
      });
      await gate.entered;
      if (state === 'demoted') {
        await Trip.updateOne(
          { _id: tripId, 'members.user': admin },
          { $set: { 'members.$.role': 'member' } }
        );
      } else if (state === 'deleting') {
        await mongoose.connection
          .db!.collection('trips')
          .updateOne(
            { _id: new mongo.ObjectId(tripId) },
            { $set: { expenseDeliveryDeleting: true } }
          );
      } else {
        await Trip.deleteOne({ _id: tripId });
      }
      gate.release();
      expect(await pending).toMatchObject({ code: 'FORBIDDEN' });
      expect(await ItineraryDay.findById(day.id).lean()).toMatchObject({
        revision: 0,
        activities: [
          { title: 'Original 0', revision: 0 },
          { title: 'Original 1', revision: 0 },
        ],
      });
      expect(mocks.cleanup).not.toHaveBeenCalled();
    }
  );

  it('rolls back the activity transaction fence on revision conflict', async () => {
    const day = await seed();
    const gate = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, day.id, {
      operation: 'update',
      activity_id: day.activities[0]._id.toString(),
      expected_activity_revision: 0,
      activity: uploaded('Stale'),
    });
    await gate.entered;
    expect(
      await mutateItineraryActivity(tripId, day.id, {
        operation: 'delete',
        activity_id: day.activities[0]._id.toString(),
        expected_activity_revision: 0,
      })
    ).toMatchObject({ success: true });
    const parent = await mongoose.connection
      .db!.collection('trips')
      .findOne({ _id: new mongo.ObjectId(tripId) });
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect(
      (await mongoose.connection
        .db!.collection('trips')
        .findOne({ _id: new mongo.ObjectId(tripId) }))!.expenseDeliveryFence
    ).toBe(parent!.expenseDeliveryFence);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it('plans the same note once across concurrent member requests', async () => {
    const day = await seed();
    const note = await Note.create({ trip: tripId, text: 'Coffee', createdBy: member });
    mocks.session.mockResolvedValue({ userId: member.toHexString() });
    const results = await Promise.all([
      planNote(tripId, note.id, { day_id: day.id }),
      planNote(tripId, note.id, { day_id: day.id }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)).toMatchObject({ code: 'VALIDATION_ERROR' });
    const stored = await ItineraryDay.findById(day.id).lean();
    expect(stored!.activities).toHaveLength(3);
    expect(stored!.revision).toBe(1);
    expect(stored!.activities[2]).toMatchObject({ title: 'Coffee', revision: 0 });
    expect((await Note.findById(note.id))!.plannedDayNumber).toBe(1);
  });

  it('rolls back an appended activity when marking its note fails', async () => {
    const day = await seed();
    const note = await Note.create({ trip: tripId, text: 'Coffee', createdBy: member });
    const spy = vi.spyOn(Note, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('Injected note write failure');
    });
    try {
      expect(await planNote(tripId, note.id, { day_id: day.id })).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    } finally {
      spy.mockRestore();
    }
    expect((await ItineraryDay.findById(day.id))!.activities).toHaveLength(2);
    expect((await ItineraryDay.findById(day.id))!.revision).toBe(0);
    expect((await Note.findById(note.id))!.plannedAt).toBeNull();
    expect(await planNote(tripId, note.id, { day_id: day.id })).toMatchObject({ success: true });
    expect((await ItineraryDay.findById(day.id))!.activities).toHaveLength(3);
  });

  it('rejects removed members and deleting trips inside the note planning transaction', async () => {
    const db = mongoose.connection.db!;
    const callback = vi.fn();
    await Trip.updateOne({ _id: tripId }, { $pull: { members: { user: member } } });
    await expect(
      withNotePlanningTransaction(db, tripId, member.toHexString(), callback)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .collection('trips')
      .updateOne({ _id: new mongo.ObjectId(tripId) }, { $set: { expenseDeliveryDeleting: true } });
    await expect(
      withNotePlanningTransaction(db, tripId, admin.toHexString(), callback)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('shares capacity and revision contracts with note planning and AI import', async () => {
    const day = await seed(12);
    const note = await Note.create({ trip: tripId, text: 'From note', createdBy: member });
    const gate = headBarrier(1);
    const pending = mutateItineraryActivity(tripId, day.id, {
      operation: 'add',
      activity: uploaded('Too late'),
    });
    await gate.entered;
    mocks.session.mockResolvedValue({ userId: member.toHexString() });
    expect(await planNote(tripId, note.id, { day_id: day.id })).toMatchObject({ success: true });
    mocks.session.mockResolvedValue({ userId: admin.toHexString() });
    const draft = importDraft(2);
    expect(await confirmItineraryImport(tripId, draft)).toMatchObject({
      success: true,
      data: { summary: { addedActivities: 2 } },
    });
    gate.release();
    expect(await pending).toMatchObject({ code: 'CONFLICT' });
    expect(await confirmItineraryImport(tripId, draft)).toMatchObject({
      success: true,
      data: { summary: { alreadyImportedDays: 1 } },
    });
    const stored = await ItineraryDay.findById(day.id).lean();
    expect(stored!.revision).toBe(2);
    expect(stored!.activities).toHaveLength(15);
    expect(stored!.activities.every((a) => a.revision === 0)).toBe(true);
    const blocked = await Note.create({ trip: tripId, text: 'Full', createdBy: member });
    expect(await planNote(tripId, blocked.id, { day_id: day.id })).toMatchObject({
      code: 'ACTIVITY_LIMIT',
    });
    expect((await Note.findById(blocked.id))!.plannedAt).toBeNull();
    expect(
      await updateItineraryDay(tripId, day.id, { expected_revision: 0, title: 'Stale' })
    ).toMatchObject({ code: 'CONFLICT' });
  });

  it.each([false, true])(
    'deduplicates concurrent AI confirmations (existing day: %s)',
    async (existing) => {
      if (existing) await seed();
      const input = importDraft();
      const results = await Promise.all([
        confirmItineraryImport('r2verify', input),
        confirmItineraryImport(tripId, input),
      ]);
      expect(
        results
          .flatMap((result) => (result.success ? result.data.days.map((day) => day.status) : []))
          .sort()
      ).toEqual(['already_imported', 'success']);
      const days = await ItineraryDay.find({ trip: tripId }).lean();
      expect(days).toHaveLength(1);
      expect(days[0].activities).toHaveLength(existing ? 3 : 1);
      expect(days[0].revision).toBe(existing ? 1 : 0);
      expect(days[0].appliedImportKeys).toHaveLength(1);
    }
  );

  it.each([false, true])(
    'rolls back a failed import date and its key while retaining other dates (existing: %s)',
    async (existing) => {
      if (existing) await seed();
      const db = mongoose.connection.db!;
      const trip = new mongo.ObjectId(tripId);
      await db.collection('photos').insertOne({
        trip,
        caption: 'import-auto',
        itineraryDay: null,
        itineraryDaySource: 'auto',
        takenLocalDate: '2026-09-01',
        location: null,
      });
      const input = importDraft();
      input.draft.days.push({ ...input.draft.days[0], date: '2026-09-02' });
      const original = mongo.Collection.prototype.bulkWrite;
      let fail = true;
      const spy = vi.spyOn(mongo.Collection.prototype, 'bulkWrite').mockImplementation(function (
        this: mongo.Collection,
        ...args
      ) {
        if (this.collectionName === 'photos' && fail) {
          fail = false;
          throw new Error('Injected photo rebind failure');
        }
        return original.apply(this, args);
      });
      try {
        expect(await confirmItineraryImport(tripId, input)).toMatchObject({
          success: true,
          data: {
            days: [{ status: 'failed', errorCode: 'INTERNAL_ERROR' }, { status: 'success' }],
            summary: { successfulDays: 1, failedDays: 1, addedActivities: 1 },
          },
        });
      } finally {
        spy.mockRestore();
      }
      const first = await ItineraryDay.findOne({ trip, dayNumber: 1 }).lean();
      if (existing) {
        expect(first!.activities).toHaveLength(2);
        expect(first!.revision).toBe(0);
        expect(first!.appliedImportKeys).toHaveLength(0);
      } else expect(first).toBeNull();
      expect(await confirmItineraryImport(tripId, input)).toMatchObject({
        success: true,
        data: {
          days: [{ status: 'success' }, { status: 'already_imported' }],
        },
      });
      const retried = await ItineraryDay.findOne({ trip, dayNumber: 1 }).lean();
      expect(retried!.activities).toHaveLength(existing ? 3 : 1);
      expect(retried!.appliedImportKeys).toHaveLength(1);
      const photo = await db.collection('photos').findOne({ trip, caption: 'import-auto' });
      expect(photo!.itineraryDay.toString()).toBe(retried!._id.toString());
    }
  );

  it.each(['demoted', 'deleting', 'deleted'])(
    'rejects an AI import when the trip is %s after initial authorization',
    async (change) => {
      const db = mongoose.connection.db!;
      const trip = new mongo.ObjectId(tripId);
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let changed = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === 'trips' && !changed) {
            changed = true;
            if (change === 'deleted') await db.collection('trips').deleteOne({ _id: trip });
            else if (change === 'deleting')
              await db
                .collection('trips')
                .updateOne({ _id: trip }, { $set: { expenseDeliveryDeleting: true } });
            else
              await db
                .collection('trips')
                .updateOne(
                  { _id: trip, 'members.user': admin },
                  { $set: { 'members.$.role': 'member' } }
                );
          }
          return original.apply(this, args);
        });
      try {
        expect(await confirmItineraryImport(tripId, importDraft())).toMatchObject({
          success: true,
          data: {
            days: [{ status: 'failed', errorCode: 'FORBIDDEN' }],
            summary: { successfulDays: 0 },
          },
        });
        expect(await ItineraryDay.countDocuments({ trip })).toBe(0);
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('uses trip dates read inside the import transaction', async () => {
    const db = mongoose.connection.db!;
    const trip = new mongo.ObjectId(tripId);
    const original = mongo.Collection.prototype.findOneAndUpdate;
    let changed = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        if (this.collectionName === 'trips' && !changed) {
          changed = true;
          await db
            .collection('trips')
            .updateOne({ _id: trip }, { $set: { startDate: new Date('2026-08-31') } });
        }
        return original.apply(this, args);
      });
    try {
      expect(await confirmItineraryImport(tripId, importDraft())).toMatchObject({
        success: true,
        data: {
          days: [{ status: 'success' }],
        },
      });
      expect(await ItineraryDay.findOne({ trip }).lean()).toMatchObject({ dayNumber: 2 });
    } finally {
      spy.mockRestore();
    }
  });

  it('initializes revisions when AI import creates a day', async () => {
    expect(await confirmItineraryImport(tripId, importDraft())).toMatchObject({
      success: true,
      data: { summary: { successfulDays: 1 } },
    });
    const day = await ItineraryDay.findOne({ trip: tripId }).lean();
    expect(day).toMatchObject({ revision: 0, activities: [{ revision: 0 }] });
  });

  it('retains authorization and trip scope with activity guards', async () => {
    const day = await seed();
    const input = {
      operation: 'delete' as const,
      activity_id: day.activities[0]._id.toString(),
      expected_activity_revision: 0,
    };
    mocks.session.mockResolvedValue({ userId: member.toHexString() });
    expect(await mutateItineraryActivity(tripId, day.id, input)).toMatchObject({
      code: 'FORBIDDEN',
    });
    mocks.session.mockResolvedValue({ userId: admin.toHexString() });
    const other = await Trip.create({
      name: 'Other',
      hashCode: 'r2other',
      members: [{ user: admin, role: 'admin' }],
    });
    expect(await mutateItineraryActivity(other.id, day.id, input)).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await ItineraryDay.findById(day.id))!.revision).toBe(0);
  });

  it('retains sibling ticket references and strips private fields from public reads', async () => {
    const day = await seed();
    const key = `itinerary/${tripId}/shared.pdf`;
    const attachment = { key, ...metadata, uploadedBy: admin, uploadedAt: new Date() };
    await ItineraryDay.updateOne(
      { _id: day.id },
      {
        $set: {
          'activities.0.attachments': [attachment],
          'activities.1.attachments': [attachment],
          'activities.1.confirmationCode': 'PRIVATE',
        },
      }
    );
    expect(
      await mutateItineraryActivity(tripId, day.id, {
        operation: 'delete',
        activity_id: day.activities[0]._id.toString(),
        expected_activity_revision: 0,
      })
    ).toMatchObject({ success: true });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    const publicDays = await readItinerary(tripId, false);
    expect(publicDays[0].activities[0]).toMatchObject({
      revision: 0,
      confirmation_code: '',
      attachments: [],
    });
    expect(JSON.stringify(publicDays)).not.toContain('PRIVATE');
    expect(JSON.stringify(publicDays)).not.toContain(key);
  });

  it('renumbering invalidates a day draft while preserving activity identity and revision', async () => {
    const first = await seed(0);
    const second = await ItineraryDay.create({
      trip: tripId,
      dayNumber: 2,
      title: 'Second',
      activities: [{ title: 'Keep' }],
    });
    expect(await deleteItineraryDay(tripId, first.id)).toMatchObject({ success: true });
    const stored = await ItineraryDay.findById(second.id).lean();
    expect(stored).toMatchObject({ dayNumber: 1, revision: 1, activities: [{ revision: 0 }] });
    expect(stored!.activities[0]._id.toString()).toBe(second.activities[0]._id.toString());
    expect(
      await updateItineraryDay(tripId, second.id, { expected_revision: 0, title: 'Stale' })
    ).toMatchObject({ code: 'CONFLICT' });
    expect(
      await mutateItineraryActivity(tripId, second.id, {
        operation: 'update',
        activity_id: second.activities[0]._id.toString(),
        expected_activity_revision: 0,
        activity: activity('Still current'),
      })
    ).toMatchObject({ success: true });
  });

  it('runs both migrations idempotently and reverses them on mixed historical documents', async () => {
    const db = mongoose.connection.db!;
    const collection = db.collection('itinerarydays');
    await collection.insertMany([
      { dayNumber: 1, activities: [{ title: 'Old' }, { title: 'Edited', revision: 7 }] },
      { dayNumber: 2, revision: 9, activities: [] },
      { dayNumber: 3 },
    ]);
    await dayUp(db);
    await activityUp(db);
    await dayUp(db);
    await activityUp(db);
    const rows = await collection.find({}).sort({ dayNumber: 1 }).toArray();
    expect(rows[0]).toMatchObject({ revision: 0, activities: [{ revision: 0 }, { revision: 7 }] });
    expect(rows[1].revision).toBe(9);
    expect(rows[2]).not.toHaveProperty('activities');
    await activityDown(db);
    await dayDown(db);
    await activityDown(db);
    await dayDown(db);
    const reverted = await collection.find({}).toArray();
    for (const row of reverted) {
      expect(row).not.toHaveProperty('revision');
      for (const a of row.activities ?? []) expect(a).not.toHaveProperty('revision');
    }
  });
});
