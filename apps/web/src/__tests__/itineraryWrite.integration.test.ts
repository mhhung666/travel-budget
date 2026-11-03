// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { itineraryWriteInput, type ItineraryWriteInput } from '@travel-budget/contracts';
const auth = vi.hoisted(() => ({ id: '' }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: auth.id }) }));
vi.mock('@/lib/mobile/session', () => ({ requireMobileUser: async () => ({ id: auth.id }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));
const storage = vi.hoisted(() => ({ head: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/storage', () => ({ headObject: storage.head, deleteObjects: storage.remove }));
import {
  writeItinerary,
  readItineraryWrite,
  readItineraryEditContext,
  ITINERARY_RECEIPTS,
} from '@/lib/itineraryWrite';
import {
  updateItineraryDay,
  mutateItineraryActivity,
  deleteItineraryDay,
} from '@/actions/itinerary.actions';
import { ItineraryDay } from '@/models';
import { rebindAutoPhotosInTransaction } from '@/lib/photoItineraryTransaction';
import { withLedgerV2 } from '@/lib/ledger';
import { POST } from '@/app/api/v2/trips/[id]/itinerary/requests/route';
import { GET } from '@/app/api/v2/trips/[id]/itinerary/requests/[uuid]/route';
import { GET as EDIT } from '@/app/api/v2/trips/[id]/itinerary/edit-context/route';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit isolated URI and write opt-in required');
const oid = () => new mongo.ObjectId();
const admin = oid(),
  other = oid(),
  member = oid(),
  outsider = oid(),
  trip = oid(),
  another = oid();
const target = {
  date: '2028-02-29',
  expected_start_date: '2028-02-28',
  expected_end_date: '2028-03-02',
};
const create = () => ({
  operation: 'day.create' as const,
  client_request_id: randomUUID(),
  title: 'Leap day',
  content: '# 原文',
  location: null,
  target,
});
const activity = {
  title: 'Visit',
  type: 'sightseeing' as const,
  time: '09:00',
  endTime: '10:00',
  location: null,
  locationName: 'Station',
  note: '多行\nNote',
  confirmationCode: 'PRIVATE-PNR',
};
const location = { name: 'Tokyo', display_name: 'Tokyo Japan', lat: 35, lon: 139 };
const write = (input: unknown, actor = admin, destination = trip) =>
  withLedgerV2(() =>
    writeItinerary(mongoose.connection.db!, actor.toString(), destination.toString(), input)
  );
const context = () =>
  withLedgerV2(() =>
    readItineraryEditContext(mongoose.connection.db!, admin.toString(), trip.toString())
  );
const receipt = (uuid: string, actor = admin, destination = trip) =>
  withLedgerV2(() =>
    readItineraryWrite(mongoose.connection.db!, actor.toString(), destination.toString(), uuid)
  );
async function addDay() {
  const input = create();
  const terminal = await write(input);
  if (terminal.status !== 'committed') throw new Error('Expected commit');
  return { ...terminal.result, input };
}
async function addActivity(dayId: string) {
  const input = {
    operation: 'activity.create' as const,
    client_request_id: randomUUID(),
    dayId,
    activity,
  };
  const terminal = await write(input);
  if (terminal.status !== 'committed') throw new Error('Expected commit');
  return { ...terminal.result, input };
}
function req(input: unknown) {
  return new Request('http://test/api/v2/trips/x/itinerary/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
describe.skipIf(!uri || !allowed)('2A isolated itinerary transactions and HTTP contracts', () => {
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_itinerary_write_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await ItineraryDay.createCollection();
    await ItineraryDay.createIndexes();
    for (const name of [
      'trips',
      'expenses',
      'photos',
      ITINERARY_RECEIPTS,
      'blobcleanupjobs',
      'retiredblobs',
    ])
      if (!(await db.listCollections({ name }).toArray()).length) await db.createCollection(name);
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    auth.id = admin.toString();
    const db = mongoose.connection.db!;
    for (const name of [
      'trips',
      'itinerarydays',
      'expenses',
      'photos',
      ITINERARY_RECEIPTS,
      'blobcleanupjobs',
      'retiredblobs',
    ])
      await db.collection(name).deleteMany({});
    await db.collection('trips').insertMany(
      [trip, another].map((_id) => ({
        _id,
        baseCurrency: 'USD',
        name: 'Trip',
        startDate: new Date('2028-02-28'),
        endDate: new Date('2028-03-02'),
        expenseDeliveryFence: 0,
        members: [
          { user: admin, role: 'admin' },
          { user: other, role: 'admin' },
          { user: member, role: 'member' },
        ],
      }))
    );
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  it('survives lost create response and concurrent original UUID replay with one row/receipt', async () => {
    const input = create();
    const results = await Promise.all([write(input), write(input)]);
    expect(results[0]).toEqual(results[1]);
    expect(await receipt(input.client_request_id)).toEqual(results[0]);
    expect(await mongoose.connection.db!.collection('itinerarydays').countDocuments({ trip })).toBe(
      1
    );
    expect(await mongoose.connection.db!.collection(ITINERARY_RECEIPTS).countDocuments({})).toBe(1);
    const ctx = await context();
    expect(ctx.days[0]).toMatchObject({ dayNumber: 2, date: '2028-02-29', revision: 0 });
  });
  it('concurrent activity creates with one UUID append once; replay after activity deletion returns the original commit', async () => {
    const day = await addDay();
    const input = {
      operation: 'activity.create',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      activity,
    };
    const results = await Promise.all([write(input), write(input)]);
    expect(results[0]).toEqual(results[1]);
    const committed = results[0];
    if (committed.status !== 'committed') throw new Error('Expected commit');
    expect((await context()).days[0].activities).toHaveLength(1);
    expect(
      await write({
        operation: 'activity.delete',
        client_request_id: randomUUID(),
        dayId: day.dayId,
        activityId: committed.result.activityId,
        expected_activity_revision: 0,
      })
    ).toMatchObject({ status: 'committed' });
    expect(await write(input)).toEqual(committed);
    expect((await context()).days[0].activities).toHaveLength(0);
  });
  it('never reuses an actor UUID for different data or another trip; canonical field order and UUID case replay', async () => {
    const input = create();
    const original = await write(input);
    await expect(write({ ...input, title: 'different' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(write(input, admin, another)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(
      await write({
        ...input,
        target: {
          expected_end_date: input.target.expected_end_date,
          expected_start_date: input.target.expected_start_date,
          date: input.target.date,
        },
        client_request_id: input.client_request_id.toUpperCase(),
      })
    ).toEqual(original);
    expect(await receipt(input.client_request_id, admin, another)).toEqual({ status: 'not_found' });
    expect(await receipt(input.client_request_id, other)).toEqual({ status: 'not_found' });
  });
  it('simultaneous same actor/UUID across different trip fences yields one commit and one idempotency conflict', async () => {
    const input = create();
    const results = await Promise.allSettled([write(input), write(input, admin, another)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect(await mongoose.connection.db!.collection('itinerarydays').countDocuments({})).toBe(1);
    expect(await mongoose.connection.db!.collection(ITINERARY_RECEIPTS).countDocuments({})).toBe(1);
  });
  it('returns original committed result even after Web deletes its day, without resurrecting it', async () => {
    const day = await addDay();
    expect((await deleteItineraryDay(trip.toString(), day.dayId)).success).toBe(true);
    expect(await write(day.input)).toEqual(await receipt(day.input.client_request_id));
    expect(await mongoose.connection.db!.collection('itinerarydays').countDocuments({ trip })).toBe(
      0
    );
  });
  it('rejects member/outsider writes and receipt/context reads; no receipt leaks on role loss', async () => {
    const day = await addDay();
    for (const actor of [member, outsider]) {
      await expect(write(create(), actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(receipt(day.input.client_request_id, actor)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    await mongoose.connection
      .db!.collection('trips')
      .updateOne({ _id: trip, 'members.user': admin }, { $set: { 'members.$.role': 'member' } });
    await expect(write(day.input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(context()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rechecks revocation inside the transaction after HTTP preflight authorization', async () => {
    const { mobileItineraryWrite } = await import('@/lib/mobile/itineraryWrite');
    const request = req(create());
    const reader = request.body!.getReader.bind(request.body);
    vi.spyOn(request.body!, 'getReader').mockImplementation(() => {
      // Body read happens after requireTripMember, pause until removal commits.
      const actual = reader();
      return {
        ...actual,
        read: async () => {
          await mongoose.connection
            .db!.collection('trips')
            .updateOne({ _id: trip }, { $pull: { members: { user: admin } } } as mongo.Document);
          return actual.read();
        },
        cancel: () => actual.cancel(),
        releaseLock: () => actual.releaseLock(),
      } as ReadableStreamDefaultReader<Uint8Array>;
    });
    await expect(
      withLedgerV2(() => mobileItineraryWrite(request, admin.toString(), trip.toString()))
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await mongoose.connection.db!.collection('itinerarydays').countDocuments({ trip })).toBe(
      0
    );
  });
  it.each([
    [{ target: { ...target, expected_end_date: null } }, 'TRIP_DATES_CHANGED'],
    [{ target: { ...target, date: '2028-03-03' } }, 'DATE_OUTSIDE_TRIP'],
  ])('persists terminal date rejection %s', async (patch, code) => {
    const input = { ...create(), ...patch };
    expect(await write(input)).toMatchObject({ status: 'rejected', code });
    expect(await write(input)).toEqual(await receipt(input.client_request_id));
  });
  it('persists occupied-day rejection, permitting a fresh confirmed UUID after correction', async () => {
    await addDay();
    const input = create();
    expect(await write(input)).toMatchObject({ status: 'rejected', code: 'DAY_ALREADY_EXISTS' });
    expect(await write(input)).toEqual(await receipt(input.client_request_id));
    expect(
      await write({
        ...input,
        client_request_id: randomUUID(),
        target: { ...target, date: '2028-03-01' },
      })
    ).toMatchObject({ status: 'committed' });
  });
  it('supports undated Day N and rejects date snapshots after Web sets trip dates', async () => {
    const db = mongoose.connection.db!;
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $set: { startDate: null, endDate: null } });
    const input = {
      ...create(),
      target: { day_number: 4, expected_start_date: null, expected_end_date: null },
    };
    expect(await write(input)).toMatchObject({ status: 'committed' });
    expect((await context()).days[0]).toMatchObject({ date: null, dayNumber: 4 });
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $set: { startDate: new Date('2028-02-28') } });
    expect(
      await write({
        ...input,
        client_request_id: randomUUID(),
        target: { ...input.target, day_number: 5 },
      })
    ).toMatchObject({ status: 'rejected', code: 'TRIP_DATES_CHANGED' });
  });
  it('allows Web/native metadata edits with exact day revisions, preserving activities/import keys', async () => {
    const day = await addDay();
    const a = await addActivity(day.dayId);
    await mongoose.connection
      .db!.collection('itinerarydays')
      .updateOne({ _id: new mongo.ObjectId(day.dayId) }, { $set: { appliedImportKeys: ['keep'] } });
    expect(
      (
        await updateItineraryDay(trip.toString(), day.dayId, {
          expected_revision: a.dayRevision!,
          title: 'Web',
        })
      ).success
    ).toBe(true);
    const stale = {
      operation: 'day.update',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      expected_revision: a.dayRevision,
      title: 'Native',
      content: '# Long',
      location,
    };
    expect(await write(stale)).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
    const fresh = {
      ...stale,
      client_request_id: randomUUID(),
      expected_revision: a.dayRevision! + 1,
    };
    expect(await write(fresh)).toMatchObject({
      status: 'committed',
      result: { dayRevision: a.dayRevision! + 2 },
    });
    const stored = await mongoose.connection
      .db!.collection('itinerarydays')
      .findOne({ _id: new mongo.ObjectId(day.dayId) });
    expect(stored!.appliedImportKeys).toEqual(['keep']);
    expect(stored!.activities[0]._id.toString()).toBe(a.activityId);
  });
  it('normalizes case-insensitive ObjectIds before shared Web validation and receipt fingerprints', async () => {
    const day = await addDay();
    const input = {
      operation: 'day.update',
      client_request_id: randomUUID(),
      dayId: day.dayId.toUpperCase(),
      expected_revision: 0,
      title: 'Case',
      content: '',
      location: null,
    };
    expect(await write(input)).toMatchObject({ status: 'committed' });
    expect(await write({ ...input, dayId: day.dayId })).toEqual(
      await receipt(input.client_request_id)
    );
  });
  it('moving a day checks trip dates/occupation while preserving gaps', async () => {
    const day = await addDay();
    const move = {
      operation: 'day.update',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      expected_revision: 0,
      title: 'Moved',
      content: '',
      location: null,
      target: { ...target, date: '2028-03-02' },
    };
    expect(await write(move)).toMatchObject({ status: 'committed', result: { dayRevision: 1 } });
    expect((await context()).days.map((d) => d.dayNumber)).toEqual([4]);
  });
  it('preserves existing ticket metadata on activity updates, with no HEAD or external cleanup', async () => {
    const day = await addDay();
    const a = await addActivity(day.dayId);
    const ticket = {
      key: `itinerary/${trip}/private.pdf`,
      contentType: 'application/pdf',
      size: 12,
      uploadedBy: admin,
      uploadedAt: new Date(),
    };
    await mongoose.connection
      .db!.collection('itinerarydays')
      .updateOne(
        { _id: new mongo.ObjectId(day.dayId) },
        { $set: { 'activities.0.attachments': [ticket] } }
      );
    const input = {
      operation: 'activity.update',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      activityId: a.activityId,
      expected_activity_revision: 0,
      activity: { ...activity, type: 'transport', title: 'Changed' },
    };
    const saved = await write(input);
    expect(saved, JSON.stringify(saved)).toMatchObject({
      status: 'committed',
      result: { activityRevision: 1 },
    });
    const stored = await mongoose.connection
      .db!.collection('itinerarydays')
      .findOne({ _id: new mongo.ObjectId(day.dayId) });
    expect(stored!.activities[0].attachments).toEqual([ticket]);
    expect(storage.head).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(JSON.stringify(await context())).not.toContain(ticket.key);
    expect(JSON.stringify(await receipt(input.client_request_id))).not.toContain('PRIVATE-PNR');
  });
  it('same-target Web edit conflicts, sibling edits and original activity UUID replay remain safe', async () => {
    const day = await addDay(),
      a = await addActivity(day.dayId),
      b = await addActivity(day.dayId);
    expect(
      (
        await mutateItineraryActivity(trip.toString(), day.dayId, {
          operation: 'update',
          activity_id: a.activityId!,
          expected_activity_revision: 0,
          activity: {
            title: 'Web',
            type: 'other',
            time: null,
            end_time: null,
            location_name: '',
            note: '',
            confirmation_code: '',
          },
        })
      ).success
    ).toBe(true);
    const remove = {
      operation: 'activity.delete',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      activityId: a.activityId,
      expected_activity_revision: 0,
    };
    expect(await write(remove)).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
    const sibling = { ...remove, client_request_id: randomUUID(), activityId: b.activityId };
    expect(await write(sibling)).toMatchObject({ status: 'committed', result: { deleted: true } });
    expect(await write(sibling)).toEqual(await receipt(sibling.client_request_id));
    expect((await context()).days[0].activities.map((x) => x.id)).toEqual([a.activityId]);
  });
  it('persists missing day/activity rejections rather than leaving permanently pending operations', async () => {
    const missing = {
      operation: 'day.update',
      client_request_id: randomUUID(),
      dayId: oid().toString(),
      expected_revision: 0,
      title: 'Missing',
      content: '',
      location: null,
    };
    expect(await write(missing)).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    expect(await receipt(missing.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'NOT_FOUND',
    });
    const day = await addDay();
    expect(
      await write({
        operation: 'activity.delete',
        client_request_id: randomUUID(),
        dayId: day.dayId,
        activityId: oid().toString(),
        expected_activity_revision: 0,
      })
    ).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
  });
  it('capacity is checked transactionally and rejects the 16th activity durably', async () => {
    const day = await addDay();
    for (let i = 0; i < 15; i++) await addActivity(day.dayId);
    const input = {
      operation: 'activity.create',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      activity,
    };
    expect(await write(input)).toMatchObject({ status: 'rejected', code: 'ACTIVITY_LIMIT' });
    expect(await receipt(input.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'ACTIVITY_LIMIT',
    });
    expect((await context()).days[0].activities).toHaveLength(15);
  });
  it('delete impact changes require renewed confirmation; committed deletion clears relations atomically without renumbering', async () => {
    const day = await addDay();
    const db = mongoose.connection.db!,
      id = new mongo.ObjectId(day.dayId);
    const before = (await context()).days[0];
    const remove = {
      operation: 'day.delete',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      expected_revision: 0,
      expected_impact_revision: before.deleteImpact.revision,
    };
    await db
      .collection('expenses')
      .insertOne({ trip, baseCurrency: 'USD', amount: 1, itineraryDays: [id] });
    await db.collection('photos').insertOne({
      trip,
      itineraryDay: id,
      itineraryDaySource: 'manual',
      location: { lat: 35, lon: 139, source: 'itinerary' },
    });
    expect(await write(remove)).toMatchObject({
      status: 'rejected',
      code: 'DELETE_IMPACT_CHANGED',
    });
    const current = (await context()).days[0];
    expect(current.deleteImpact).toMatchObject({ expenseCount: 1, photoCount: 1 });
    await write({ ...create(), target: { ...target, date: '2028-03-02' } });
    expect(
      await write({
        ...remove,
        client_request_id: randomUUID(),
        expected_impact_revision: current.deleteImpact.revision,
      })
    ).toMatchObject({ status: 'committed', result: { deleted: true } });
    expect((await db.collection('expenses').findOne({ trip }))!.itineraryDays).toEqual([]);
    expect(await db.collection('photos').findOne({ trip })).toMatchObject({
      itineraryDay: null,
      location: null,
    });
    expect((await context()).days.map((d) => d.dayNumber)).toEqual([4]);
  });
  it('receipt storage failure rolls back day update, revision and borrowed photo location; exact retry works', async () => {
    const day = await addDay();
    const db = mongoose.connection.db!;
    await db
      .collection('photos')
      .insertOne({ trip, itineraryDay: new mongo.ObjectId(day.dayId), location: null });
    const input = {
      operation: 'day.update',
      client_request_id: randomUUID(),
      dayId: day.dayId,
      expected_revision: 0,
      title: 'Rollback',
      content: '',
      location,
    };
    vi.spyOn(mongo.Collection.prototype, 'insertOne').mockRejectedValueOnce(
      new Error('receipt unavailable')
    );
    await expect(write(input)).rejects.toThrow('receipt unavailable');
    vi.restoreAllMocks();
    expect((await context()).days[0]).toMatchObject({
      title: 'Leap day',
      revision: 0,
      location: null,
    });
    expect((await db.collection('photos').findOne({ trip }))!.location).toBeNull();
    expect(await receipt(input.client_request_id)).toEqual({ status: 'not_found' });
    expect(await write(input)).toMatchObject({ status: 'committed' });
  });
  it('read context and receipt lookup do not write the trip fence, including over a cursor batch', async () => {
    const day = await addDay();
    const db = mongoose.connection.db!;
    await db
      .collection('photos')
      .insertMany(
        Array.from({ length: 130 }, () => ({ trip, itineraryDay: new mongo.ObjectId(day.dayId) }))
      );
    const before = (await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence;
    expect((await context()).days[0].deleteImpact.photoCount).toBe(130);
    await receipt(day.input.client_request_id);
    expect((await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence).toBe(
      before
    );
    await db
      .collection('photos')
      .updateMany({ trip }, { $set: { itineraryDaySource: 'auto', takenLocalDate: '2028-02-29' } });
    expect(
      await write({
        operation: 'day.update',
        client_request_id: randomUUID(),
        dayId: day.dayId,
        expected_revision: 0,
        title: 'Moved',
        content: '',
        location: null,
        target: { ...target, date: '2028-03-01' },
      })
    ).toMatchObject({ status: 'committed' });
    expect(await db.collection('photos').countDocuments({ trip, itineraryDay: null })).toBe(130);
  });
  it('stops photo rebinding before the batch write when the shared deadline expires', async () => {
    await addDay();
    const db = mongoose.connection.db!;
    const photo = await db.collection('photos').insertOne({
      trip,
      itineraryDay: null,
      itineraryDaySource: 'auto',
      takenLocalDate: '2028-02-29',
    });
    let operations = 0;
    await expect(
      db.client.withSession((session) =>
        session.withTransaction(() =>
          rebindAutoPhotosInTransaction(
            db,
            session,
            trip,
            {
              startDate: new Date('2028-02-28'),
              endDate: new Date('2028-03-02'),
            },
            new Date(),
            () => {
              // The two reads consume the remaining budget; the write must check it again.
              if (++operations > 2)
                throw new mongo.MongoOperationTimeoutError('Shared deadline expired');
              return { session, timeoutMS: 1000 };
            }
          )
        )
      )
    ).rejects.toThrow('Shared deadline expired');
    expect(
      (await db.collection('photos').findOne({ _id: photo.insertedId }))!.itineraryDay
    ).toBeNull();
  });
  it('serves authenticated no-store HTTP, strict payloads, large Markdown and original UUID recovery', async () => {
    const input = { ...create(), content: '長'.repeat(12000) };
    const response = await POST(req(input), { params: Promise.resolve({ id: trip.toString() }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vary')).toBe('Authorization');
    const value = await response.json();
    expect(value.data.status).toBe('committed');
    const recovered = await GET(new Request('http://test/'), {
      params: Promise.resolve({ id: trip.toString(), uuid: input.client_request_id }),
    });
    expect(await recovered.json()).toEqual(value);
    const invalid = await POST(req({ ...create(), attachments: [] }), {
      params: Promise.resolve({ id: trip.toString() }),
    });
    expect(invalid.status).toBe(400);
    const huge = await POST(req({ ...create(), content: 'a'.repeat(270000) }), {
      params: Promise.resolve({ id: trip.toString() }),
    });
    expect(huge.status).toBe(413);
    auth.id = member.toString();
    expect(
      (
        await EDIT(new Request('http://test/'), {
          params: Promise.resolve({ id: trip.toString() }),
        })
      ).status
    ).toBe(403);
    auth.id = outsider.toString();
    expect(
      (
        await GET(new Request('http://test/'), {
          params: Promise.resolve({ id: trip.toString(), uuid: input.client_request_id }),
        })
      ).status
    ).toBe(404);
  });
});

describe('itinerary command boundary', () => {
  it.each([
    { ...create(), target: { ...target, date: '2028-02-30' } },
    { ...create(), target: { ...target, day_number: 3 } },
    { ...create(), activities: [] },
    {
      operation: 'activity.create',
      client_request_id: randomUUID(),
      dayId: trip.toString(),
      activity: { ...activity, attachments: [] },
    },
    {
      operation: 'activity.update',
      client_request_id: randomUUID(),
      dayId: trip.toString(),
      activityId: member.toString(),
      expected_activity_revision: -1,
      activity,
    },
    { ...create(), location: { ...location, lat: 91 } },
  ])('rejects malformed, attachment and forged fields %#', (input) =>
    expect(itineraryWriteInput.safeParse(input).success).toBe(false)
  );
  it('accepts all six explicit commands with no platform/database dependencies', () => {
    const inputs: ItineraryWriteInput[] = [
      create(),
      {
        operation: 'day.update',
        client_request_id: randomUUID(),
        dayId: trip.toString(),
        expected_revision: 0,
        title: 'Day',
        content: '',
        location: null,
      },
      {
        operation: 'day.delete',
        client_request_id: randomUUID(),
        dayId: trip.toString(),
        expected_revision: 0,
        expected_impact_revision: 'a'.repeat(64),
      },
      {
        operation: 'activity.create',
        client_request_id: randomUUID(),
        dayId: trip.toString(),
        activity,
      },
      {
        operation: 'activity.update',
        client_request_id: randomUUID(),
        dayId: trip.toString(),
        activityId: member.toString(),
        expected_activity_revision: 0,
        activity,
      },
      {
        operation: 'activity.delete',
        client_request_id: randomUUID(),
        dayId: trip.toString(),
        activityId: member.toString(),
        expected_activity_revision: 0,
      },
    ];
    inputs.forEach((input) => expect(itineraryWriteInput.safeParse(input).success).toBe(true));
  });
});
