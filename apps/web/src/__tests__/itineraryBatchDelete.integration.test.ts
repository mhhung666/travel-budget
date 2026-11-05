// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import {
  activityDeletionInput,
  activityDeletionPreviewInput,
  activityDeletionStateSchema,
} from '@travel-budget/contracts';
const auth = vi.hoisted(() => ({ id: '' }));
const storage = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: auth.id }) }));
vi.mock('@/lib/mobile/session', () => ({ requireMobileUser: async () => ({ id: auth.id }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));
vi.mock('@/lib/storage', () => ({ deleteObjects: storage.remove }));
import {
  deleteActivities,
  previewActivityDeletion,
  readActivityDeletion,
} from '@/lib/itineraryBatchDelete';
import { writeItinerary, readItineraryWrite, ITINERARY_RECEIPTS } from '@/lib/itineraryWrite';
import { withLedgerV2 } from '@/lib/ledger';
import {
  previewWebActivityDeletion,
  writeWebActivityDeletion,
} from '@/actions/itineraryBatch.actions';
import { POST } from '@/app/api/v2/trips/[id]/itinerary/activity-deletions/route';
import { POST as PREVIEW } from '@/app/api/v2/trips/[id]/itinerary/activity-deletions/preview/route';
import { GET } from '@/app/api/v2/trips/[id]/itinerary/activity-deletions/[uuid]/route';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit isolated URI and write opt-in required');
const admin = new mongo.ObjectId(),
  member = new mongo.ObjectId(),
  outsider = new mongo.ObjectId();
const trip = new mongo.ObjectId(),
  another = new mongo.ObjectId(),
  dayId = new mongo.ObjectId(),
  otherDay = new mongo.ObjectId();
const ids = Array.from({ length: 4 }, () => new mongo.ObjectId());
const onlyKey = `itinerary/${trip}/only.jpg`,
  sharedKey = `itinerary/${trip}/shared.jpg`;
const db = () => mongoose.connection.db!;
const scope = <T>(work: () => Promise<T>) => withLedgerV2(work);
const target = (indexes = [0, 1, 2]) => ({
  dayId: dayId.toString(),
  targets: indexes.map((i) => ({ activityId: ids[i].toString(), expectedRevision: 1 })),
});
const read = (input = target()) =>
  scope(() => previewActivityDeletion(db(), admin.toString(), trip.toString(), input));
const write = (input: unknown, actor = admin, destination = trip) =>
  scope(() => deleteActivities(db(), actor.toString(), destination.toString(), input));
const lookup = (uuid: string, actor = admin) =>
  scope(() => readActivityDeletion(db(), actor.toString(), trip.toString(), uuid));
async function command(indexes = [0, 1, 2]) {
  const input = target(indexes),
    p = await read(input);
  return { ...input, client_request_id: randomUUID(), expectedContextRevision: p.contextRevision };
}
function request(body?: unknown) {
  return new Request(
    'http://localhost/api/v2/itinerary/activity-deletions',
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}
  );
}
const params = () => ({ params: Promise.resolve({ id: trip.toString() }) });
describe.skipIf(!uri || !allowed)('BD1 isolated batch deletion transactions', () => {
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_bd1_${randomUUID().replaceAll('-', '')}`,
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    expect(await db().listCollections().toArray()).toHaveLength(0);
    owned = true;
    for (const name of [
      'trips',
      'itinerarydays',
      'expenses',
      'photos',
      ITINERARY_RECEIPTS,
      'blobcleanupjobs',
      'flightrecords',
    ])
      await db().createCollection(name);
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    storage.remove.mockReset().mockResolvedValue(undefined);
    auth.id = admin.toString();
    for (const name of [
      'trips',
      'itinerarydays',
      'expenses',
      'photos',
      ITINERARY_RECEIPTS,
      'blobcleanupjobs',
      'flightrecords',
    ])
      await db().collection(name).deleteMany({});
    await db()
      .collection('trips')
      .insertMany(
        [trip, another].map((_id) => ({
          _id,
          hashCode: _id.equals(trip) ? 'batchday' : 'another1',
          baseCurrency: 'USD',
          startDate: new Date('2028-02-28'),
          endDate: new Date('2028-03-02'),
          members: [
            { user: admin, role: 'admin' },
            { user: member, role: 'member' },
          ],
          expenseDeliveryFence: 0,
        }))
      );
    const attachment = (key: string) => ({
      key,
      contentType: 'image/jpeg',
      size: 1,
      uploadedBy: admin,
      uploadedAt: new Date(),
    });
    const now = new Date();
    await db()
      .collection('itinerarydays')
      .insertMany([
        {
          _id: dayId,
          trip,
          dayNumber: 2,
          title: 'Leap day',
          content: 'Keep this',
          revision: 1,
          createdAt: now,
          updatedAt: now,
          activities: ids.map((_id, i) => ({
            _id,
            revision: 1,
            title: 'Same name',
            time: `0${i + 6}:00`,
            type: 'food',
            note: 'PRIVATE-NOTE',
            confirmationCode: 'PRIVATE-PNR',
            attachments:
              i === 0 ? [attachment(onlyKey)] : i === 1 || i === 3 ? [attachment(sharedKey)] : [],
          })),
        },
        {
          _id: otherDay,
          trip,
          dayNumber: 3,
          title: 'Keep other day',
          revision: 1,
          content: '',
          createdAt: now,
          updatedAt: now,
          activities: [],
        },
      ]);
  });
  afterAll(async () => {
    if (owned) await db().dropDatabase();
    await mongoose.disconnect();
  });
  it('previews only selected details in one authorized read without writing a fence or receipt', async () => {
    const p = await read();
    expect(p.date).toBe('2028-02-29');
    expect(p.targets).toHaveLength(3);
    expect(p.missingIds).toEqual([]);
    expect(p.changedIds).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/PRIVATE|\.jpg|uploadedBy/);
    expect((await db().collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence).toBe(0);
    expect(await db().collection(ITINERARY_RECEIPTS).countDocuments()).toBe(0);
  });
  it('commits one batch, preserves the day, siblings, expenses, photos and personal records', async () => {
    await db()
      .collection('expenses')
      .insertOne({ trip, baseCurrency: 'USD', itineraryDays: [dayId] });
    await db().collection('photos').insertOne({ trip, itineraryDay: dayId });
    await db().collection('flightrecords').insertOne({ trip, sourceActivity: ids[0], user: admin });
    const input = await command();
    const terminal = await write(input);
    expect(terminal.status).toBe('committed');
    const day = await db().collection('itinerarydays').findOne({ _id: dayId });
    expect(day!.activities.map((a: { _id: mongo.ObjectId }) => a._id)).toEqual([ids[3]]);
    expect(day!.revision).toBe(2);
    expect(day!.content).toBe('Keep this');
    for (const name of ['expenses', 'photos', 'flightrecords'])
      expect(await db().collection(name).countDocuments()).toBe(1);
    expect(await db().collection('itinerarydays').countDocuments()).toBe(2);
    expect(
      await db().collection<{ _id: string }>('blobcleanupjobs').countDocuments({ _id: onlyKey })
    ).toBe(1);
    expect(
      await db().collection<{ _id: string }>('blobcleanupjobs').countDocuments({ _id: sharedKey })
    ).toBe(0);
    expect(JSON.stringify(await db().collection(ITINERARY_RECEIPTS).findOne({}))).not.toMatch(
      /PRIVATE|Same name|\.jpg/
    );
    await db().collection('itinerarydays').deleteOne({ _id: dayId });
    expect(await lookup(input.client_request_id)).toEqual(terminal);
    expect(await write(input)).toEqual(terminal);
  });
  it.each([0, 1, 2])(
    'rejects the whole batch if target %s changed; no partial effects',
    async (i) => {
      const input = await command();
      await db()
        .collection('itinerarydays')
        .updateOne({ _id: dayId }, { $inc: { [`activities.${i}.revision`]: 1 } });
      expect(await write(input)).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
      expect(
        (await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities
      ).toHaveLength(4);
      expect(await db().collection('blobcleanupjobs').countDocuments()).toBe(0);
      expect(await db().collection(ITINERARY_RECEIPTS).countDocuments()).toBe(1);
    }
  );
  it('does not partially delete when one target disappeared or belongs to another day', async () => {
    const input = await command();
    input.targets[2].activityId = new mongo.ObjectId().toString();
    expect(await write(input)).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    const p = await read({ dayId: input.dayId, targets: input.targets });
    expect(p.missingIds).toEqual([input.targets[2].activityId]);
    expect(
      (await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities
    ).toHaveLength(4);
  });
  it.each(['title', 'date', 'ticket'])('rejects changed confirmation context: %s', async (kind) => {
    const input = await command();
    if (kind === 'title')
      await db()
        .collection('itinerarydays')
        .updateOne({ _id: dayId }, { $set: { title: 'Changed' } });
    if (kind === 'date')
      await db()
        .collection('trips')
        .updateOne({ _id: trip }, { $set: { startDate: new Date('2028-03-01') } });
    if (kind === 'ticket')
      await db()
        .collection('itinerarydays')
        .updateOne({ _id: dayId }, { $set: { 'activities.0.attachments': [] } });
    expect(await write(input)).toMatchObject({ status: 'rejected', code: 'CONFLICT' });
    expect(
      (await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities
    ).toHaveLength(4);
  });
  it('ignores unselected activity and day content/revision edits', async () => {
    const input = await command();
    await db()
      .collection('itinerarydays')
      .updateOne(
        { _id: dayId },
        {
          $set: { content: 'New content', 'activities.3.title': 'Sibling changed' },
          $inc: { revision: 1, 'activities.3.revision': 1 },
        }
      );
    expect(await write(input)).toMatchObject({ status: 'committed' });
    expect(
      (await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities[0].title
    ).toBe('Sibling changed');
  });
  it('deduplicates concurrent UUIDs and canonicalizes target order and case', async () => {
    const input = await command();
    const results = await Promise.all(Array.from({ length: 5 }, () => write(input)));
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
    expect(
      await write({
        ...input,
        client_request_id: input.client_request_id.toUpperCase(),
        targets: [...input.targets]
          .reverse()
          .map((t) => ({ ...t, activityId: t.activityId.toUpperCase() })),
      })
    ).toEqual(results[0]);
    expect((await db().collection('itinerarydays').findOne({ _id: dayId }))!.revision).toBe(2);
    expect(await db().collection(ITINERARY_RECEIPTS).countDocuments()).toBe(1);
    await expect(write({ ...input, targets: input.targets.slice(0, 1) })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      scope(() =>
        readItineraryWrite(db(), admin.toString(), trip.toString(), input.client_request_id)
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(write(input, admin, another)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      scope(() =>
        writeItinerary(db(), admin.toString(), trip.toString(), {
          operation: 'day.delete',
          dayId: dayId.toString(),
          expected_revision: 2,
          expected_impact_revision: 'a'.repeat(64),
          client_request_id: input.client_request_id,
        })
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('rolls back deletion, revision, cleanup and fence if receipt persistence fails', async () => {
    const input = await command(),
      receipts = db().collection(ITINERARY_RECEIPTS);
    const instance = db();
    const collection = instance.collection.bind(instance);
    vi.spyOn(db(), 'collection').mockImplementation(((name: string) =>
      name === ITINERARY_RECEIPTS ? receipts : collection(name)) as typeof instance.collection);
    vi.spyOn(receipts, 'insertOne').mockRejectedValueOnce(new Error('storage down'));
    await expect(write(input)).rejects.toThrow('storage down');
    expect(
      (await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities
    ).toHaveLength(4);
    expect((await db().collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence).toBe(0);
    expect(await db().collection('blobcleanupjobs').countDocuments()).toBe(0);
    expect(await lookup(input.client_request_id)).toEqual({ status: 'not_found' });
  });
  it('keeps a committed terminal when R2 fails; full selection retains an empty day', async () => {
    const input = await command([0, 1, 2, 3]);
    storage.remove.mockRejectedValue(new Error('R2 down'));
    const terminal = await write(input);
    expect(terminal.status).toBe('committed');
    expect((await db().collection('itinerarydays').findOne({ _id: dayId }))!.activities).toEqual(
      []
    );
    expect(await lookup(input.client_request_id)).toEqual(terminal);
    expect(
      await db()
        .collection('blobcleanupjobs')
        .countDocuments({ availableAt: { $exists: true } })
    ).toBe(2);
  });
  it('rechecks admin access for preview/write/lookup, keeping inaccessible receipts intact', async () => {
    const input = await command();
    await write(input);
    await db()
      .collection('trips')
      .updateOne({ _id: trip, 'members.user': admin }, { $set: { 'members.$.role': 'member' } });
    await expect(lookup(input.client_request_id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const actor of [admin, member, outsider])
      await expect(write(input, actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db().collection(ITINERARY_RECEIPTS).countDocuments()).toBe(1);
  });
  it('uses strict bounded schemas and shares Web cookie and bearer HTTP service results', async () => {
    const input = await command();
    for (const targets of [
      [],
      Array(16).fill(input.targets[0]),
      [input.targets[0], input.targets[0]],
    ]) {
      expect(activityDeletionPreviewInput.safeParse({ ...target(), targets }).success).toBe(false);
      expect((await POST(request({ ...input, targets }), params())).status).toBe(400);
    }
    expect(activityDeletionInput.safeParse({ ...input, title: 'Injected' }).success).toBe(false);
    const p = await previewWebActivityDeletion('batchday', target());
    expect(p.success).toBe(true);
    const http = await PREVIEW(request(target()), params());
    expect(http.status).toBe(200);
    expect(http.headers.get('cache-control')).toBe('no-store');
    const first = await writeWebActivityDeletion('batchday', input);
    expect(first.success).toBe(true);
    const response = await POST(request(input), params());
    expect(response.status).toBe(200);
    const state = activityDeletionStateSchema.parse((await response.json()).data);
    if (first.success) expect(state).toEqual(first.data);
    const recovered = await GET(request(), {
      params: Promise.resolve({ id: trip.toString(), uuid: input.client_request_id }),
    });
    expect((await recovered.json()).data).toEqual(state);
    auth.id = member.toString();
    expect((await PREVIEW(request(target()), params())).status).toBe(403);
    expect(
      (
        await GET(request(), {
          params: Promise.resolve({ id: trip.toString(), uuid: input.client_request_id }),
        })
      ).status
    ).toBe(403);
  });
});
