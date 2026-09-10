// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
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
import { planNote } from '@/actions/note.actions';
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
    expect(mocks.cleanup).toHaveBeenCalledWith('receipts', [ticketKey]);
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
