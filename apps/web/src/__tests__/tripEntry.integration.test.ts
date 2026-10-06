// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { enterTrip, readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
const uri = process.env.MONGODB_E1_TEST_URI ?? process.env.MONGODB_MEMBER_TEST_URI;
const allowed =
  (process.env.MONGODB_E1_TEST_ALLOW_WRITES ?? process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES) ===
  '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('E1 transactions against isolated replica set', () => {
  let client: mongo.MongoClient;
  let db: mongo.Db;
  let owned = false;
  const actor = new mongo.ObjectId();
  const peer = new mongo.ObjectId();
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_e1_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db.collection('trips').createIndex({ hashCode: 1 }, { unique: true });
    for (const name of [MUTATION_REQUESTS, 'users', 'activitylogs', 'notifications'])
      await db.createCollection(name);
    await db.collection('users').insertMany([
      { _id: actor, displayName: 'Creator' },
      { _id: peer, displayName: 'Peer' },
    ]);
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });
  beforeEach(async () => {
    for (const name of ['trips', MUTATION_REQUESTS, 'activitylogs', 'notifications'])
      await db.collection(name).deleteMany({});
  });
  const body = () => ({
    client_request_id: randomUUID(),
    name: 'Trip',
    description: '',
    start_date: null,
    end_date: null,
  });
  it('receipt insertion failure rolls back the trip and retry can commit once', async () => {
    const receipts = db.collection(MUTATION_REQUESTS);
    const original = db.collection.bind(db);
    const failed = Object.create(db) as mongo.Db;
    failed.collection = ((name: string) =>
      name === MUTATION_REQUESTS
        ? new Proxy(receipts, {
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
    const input = body();
    await expect(enterTrip(failed, actor.toHexString(), 'trip.create', input)).rejects.toThrow(
      'disk full'
    );
    expect(await db.collection('trips').countDocuments()).toBe(0);
    expect(await receipts.countDocuments()).toBe(0);
    await enterTrip(db, actor.toHexString(), 'trip.create', input);
    expect(await db.collection('trips').countDocuments()).toBe(1);
  });
  it('post-commit external failure returns success; replay cannot schedule it again', async () => {
    const created = await enterTrip(db, actor.toHexString(), 'trip.create', body());
    const trip = await db.collection('trips').findOne({ _id: new mongo.ObjectId(created.tripId) });
    const input = { client_request_id: randomUUID(), invite_code: trip!.hashCode };
    const deliver = vi.fn(async () => {
      throw new Error('mail unavailable');
    });
    const first = await enterTrip(db, peer.toHexString(), 'trip.join', input, deliver);
    expect(await enterTrip(db, peer.toHexString(), 'trip.join', input, deliver)).toEqual(first);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect(await db.collection('notifications').countDocuments()).toBe(1);
  });
  it('concurrent different UUID joins add only one member/event; rejected key remains terminal', async () => {
    const created = await enterTrip(db, actor.toHexString(), 'trip.create', body());
    const trip = await db.collection('trips').findOne({ _id: new mongo.ObjectId(created.tripId) });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        enterTrip(db, peer.toHexString(), 'trip.join', {
          client_request_id: randomUUID(),
          invite_code: trip!.hashCode,
        })
      )
    );
    expect(results.filter((v) => !v.alreadyMember)).toHaveLength(1);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    const rejected = { client_request_id: randomUUID(), invite_code: 'bad123' };
    await expect(enterTrip(db, peer.toHexString(), 'trip.join', rejected)).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    });
    await db.collection('trips').updateOne({ _id: trip!._id }, { $set: { hashCode: 'bad123' } });
    await expect(enterTrip(db, peer.toHexString(), 'trip.join', rejected)).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    });
    expect(
      await readTripMutation(db, peer.toHexString(), rejected.client_request_id)
    ).toMatchObject({ status: 'rejected' });
  });
  it('effect insertion failure rolls back membership and receipt together', async () => {
    const created = await enterTrip(db, actor.toHexString(), 'trip.create', body());
    const trip = await db.collection('trips').findOne({ _id: new mongo.ObjectId(created.tripId) });
    const original = db.collection.bind(db);
    const failed = Object.create(db) as mongo.Db;
    failed.collection = ((name: string) =>
      name === 'activitylogs'
        ? {
            insertOne: async () => {
              throw new Error('effect storage');
            },
          }
        : original(name)) as typeof db.collection;
    const input = { client_request_id: randomUUID(), invite_code: trip!.hashCode };
    await expect(enterTrip(failed, peer.toHexString(), 'trip.join', input)).rejects.toThrow(
      'effect storage'
    );
    expect((await db.collection('trips').findOne({ _id: trip!._id }))!.members).toHaveLength(1);
    expect(await readTripMutation(db, peer.toHexString(), input.client_request_id)).toEqual({
      status: 'not_found',
    });
  });
});
