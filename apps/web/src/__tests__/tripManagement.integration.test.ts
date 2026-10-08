// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  manageTrip,
  readTripSettings,
  updateTripForActor,
  archiveTripForActor,
} from '@/lib/tripManagement';
import { readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('G1a isolated trip management', () => {
  let client: mongo.MongoClient, db: mongo.Db;
  let owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    trip = new mongo.ObjectId();
  const secret = 'g1-isolated-test';
  const context = (id = actor) => readTripSettings(db, id.toString(), trip.toString(), secret);
  const write = (body: {
    client_request_id: string;
    expected_revision: string;
    changes: { name?: string; start_date?: string; end_date?: string };
  }) => manageTrip(db, actor.toString(), trip.toString(), 'trip.update', body, secret);
  const body = async () => ({
    client_request_id: randomUUID(),
    expected_revision: (await context()).revision,
    changes: { name: 'Mobile name' },
  });
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_g1_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });
  beforeEach(async () => {
    for (const name of ['trips', 'itinerarydays', 'photos', MUTATION_REQUESTS])
      await db.collection(name).deleteMany({});
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'Original',
      description: 'note',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-05'),
      destinationLocation: {
        name: 'Tokyo',
        display_name: 'Tokyo, Japan',
        lat: 35.68,
        lon: 139.75,
        country_code: 'JP',
        names: { jp: '東京' },
      },
      hashCode: 'secretcode',
      currencySettings: { currencies: ['JPY'] },
      members: [
        { user: actor, role: 'admin', archivedAt: null, budget: 99 },
        { user: peer, role: 'member', budget: 123 },
      ],
    });
  });
  it('member context omits budgets/invite/other member data and does not grant editing', async () => {
    const data = await context(peer);
    expect(data.role).toBe('member');
    expect(JSON.stringify(data)).not.toMatch(/budget|hashCode|secretcode|currencySettings|members/);
    await expect(
      manageTrip(
        db,
        peer.toString(),
        trip.toString(),
        'trip.update',
        { ...(await body()), expected_revision: data.revision },
        secret
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('same UUID concurrent/replay commits once and old revision can still replay', async () => {
    const input = await body();
    const results = await Promise.all(Array.from({ length: 5 }, () => write(input)));
    expect(new Set(results.map((r) => r.revision)).size).toBe(1);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(1);
    await updateTripForActor(db, actor.toString(), trip.toString(), { name: 'Web name' });
    expect(await write(input)).toEqual(results[0]);
    expect((await context()).name).toBe('Web name');
    await expect(write({ ...input, changes: { name: 'Different' } })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('Web edits invalidate the old Mobile revision and preserve a terminal rejection', async () => {
    const input = await body();
    await updateTripForActor(db, actor.toString(), trip.toString(), { description: 'Web edit' });
    await expect(write(input)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_CHANGED',
    });
    expect((await context()).name).toBe('Original');
  });
  it('only own archive state changes and does not invalidate editing revision', async () => {
    const before = await context(peer),
      admin = await context();
    const input = {
      client_request_id: randomUUID(),
      expected_revision: before.archiveRevision,
      archived: true,
    };
    await manageTrip(db, peer.toString(), trip.toString(), 'trip.archive', input, secret);
    const raw = await db.collection('trips').findOne({ _id: trip });
    expect(raw!.members[0].archivedAt).toBeNull();
    expect(raw!.members[1].archivedAt).toBeInstanceOf(Date);
    expect((await context()).revision).toBe(admin.revision);
    expect((await context(peer)).archived).toBe(true);
    expect(
      await manageTrip(db, peer.toString(), trip.toString(), 'trip.archive', input, secret)
    ).toEqual({ tripId: trip.toString(), archived: true });
    await archiveTripForActor(db, peer.toString(), trip.toString(), false);
    expect((await context(peer)).archived).toBe(false);
    expect(
      await manageTrip(db, peer.toString(), trip.toString(), 'trip.archive', input, secret)
    ).toMatchObject({ archived: true });
    expect((await context(peer)).archived).toBe(false);
  });
  it('Web archive changes require fresh explicit confirmation', async () => {
    const before = await context();
    await archiveTripForActor(db, actor.toString(), trip.toString(), true);
    await expect(
      manageTrip(
        db,
        actor.toString(),
        trip.toString(),
        'trip.archive',
        {
          client_request_id: randomUUID(),
          expected_revision: before.archiveRevision,
          archived: true,
        },
        secret
      )
    ).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
  });
  it('basic updates preserve location/private settings; partial date inversion is terminal', async () => {
    const input = await body();
    await write(input);
    const raw = await db.collection('trips').findOne({ _id: trip });
    expect(raw!.destinationLocation.country_code).toBe('JP');
    expect(raw!.currencySettings).toEqual({ currencies: ['JPY'] });
    expect(raw!.members[1].budget).toBe(123);
    const invalid = {
      client_request_id: randomUUID(),
      expected_revision: (await context()).revision,
      changes: { start_date: '2026-10-06' },
    };
    await expect(write(invalid)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await context()).startDate).toBe('2026-10-01');
    expect(await readTripMutation(db, actor.toString(), invalid.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION_ERROR',
    });
  });
  it('date change atomically rebinds auto photos and keeps manual associations', async () => {
    const day = new mongo.ObjectId();
    await db
      .collection('itinerarydays')
      .insertOne({ _id: day, trip, dayNumber: 1, location: { lat: 1, lon: 2 } });
    await db.collection('photos').insertMany([
      { trip, itineraryDaySource: 'auto', takenLocalDate: '2026-10-02' },
      { trip, itineraryDaySource: 'manual', itineraryDay: day },
    ]);
    await write({ ...(await body()), changes: { start_date: '2026-10-02' } });
    const photos = await db.collection('photos').find({ trip }).toArray();
    expect(photos[0].itineraryDay.toString()).toBe(day.toString());
    expect(photos[0].location).toEqual({ lat: 1, lon: 2, source: 'itinerary' });
    expect(photos[1].itineraryDay.toString()).toBe(day.toString());
  });
  it('removal denies new writes and all receipts; role loss denies only new edits', async () => {
    const input = await body();
    await write(input);
    await db
      .collection('trips')
      .updateOne({ _id: trip, 'members.user': actor }, { $set: { 'members.$.role': 'member' } });
    expect(await write(input)).toMatchObject({ tripId: trip.toString() });
    await expect(write({ ...(await body()), changes: { name: 'New' } })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as mongo.Document);
    await expect(write(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readTripMutation(db, actor.toString(), input.client_request_id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('receipt storage failure rolls back edits and auto photo rebinds', async () => {
    const input = await body();
    const original = db.collection.bind(db);
    const broken = Object.create(db) as mongo.Db;
    broken.collection = ((name: string) =>
      name === MUTATION_REQUESTS
        ? new Proxy(original(name), {
            get(target, key) {
              if (key === 'insertOne')
                return async () => {
                  throw new Error('disk full');
                };
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          })
        : original(name)) as typeof db.collection;
    await expect(
      manageTrip(broken, actor.toString(), trip.toString(), 'trip.update', input, secret)
    ).rejects.toThrow('disk full');
    expect((await context()).name).toBe('Original');
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(0);
  });
});
