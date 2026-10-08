// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { manageTrip, readTripCurrency, updateTripForActor } from '@/lib/tripManagement';
import { setCurrencySettingsForActor } from '@/lib/currencySettings';
import { readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('G2a isolated currency management', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    trip = new mongo.ObjectId();
  const secret = 'g2a-isolated';
  const context = (id = actor) => readTripCurrency(db, id.toString(), trip.toString(), secret);
  const body = async () => ({
    client_request_id: randomUUID(),
    expected_revision: (await context()).revision,
    settings: {
      default_currency: 'JPY',
      currencies: [
        { code: 'JPY', rate: 0.2156789012345 },
        { code: 'TWD', rate: 9 },
      ],
    },
  });
  const write = (input: Awaited<ReturnType<typeof body>>, id = actor, database = db) =>
    manageTrip(database, id.toString(), trip.toString(), 'trip.currency', input, secret);
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_g2a_${randomUUID().replaceAll('-', '')}`);
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
    for (const name of ['trips', 'expenses', 'payments', MUTATION_REQUESTS])
      await db.collection(name).deleteMany({});
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'Original',
      currencySettings: null,
      hashCode: 'private',
      members: [
        { user: actor, role: 'admin', budget: 123 },
        { user: peer, role: 'member' },
      ],
    });
    await db.collection('expenses').insertOne({
      trip,
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.21,
      amount: 21,
      splits: [{ user: peer, shareAmount: 21 }],
      attachments: ['private'],
    });
    await db.collection('payments').insertOne({ trip, amount: 5 });
  });
  it('member-readable context contains only settings, supported codes and opaque revision', async () => {
    const data = await context(peer);
    expect(data.role).toBe('member');
    expect(data.settings).toBeNull();
    expect(data.supportedCurrencies).toContain('KRW');
    expect(JSON.stringify(data)).not.toMatch(/budget|hashCode|private|splits|members/);
    expect((await context()).revision).toBe((await context()).revision);
  });
  it('shared Web and Mobile writer preserve stored expenses/payments and unrelated settings', async () => {
    const expenses = await db.collection('expenses').find({}).toArray();
    const payments = await db.collection('payments').find({}).toArray();
    await write(await body());
    expect((await context()).settings).toEqual({
      default_currency: 'JPY',
      currencies: [
        { code: 'JPY', rate: 0.2156789012345 },
        { code: 'TWD', rate: null },
      ],
    });
    await setCurrencySettingsForActor(db, actor.toString(), trip.toString(), {
      default_currency: 'USD',
      currencies: [
        { code: 'USD', rate: 30 },
        { code: 'USD', rate: 32 },
      ],
    });
    expect((await context()).settings?.currencies).toEqual([{ code: 'USD', rate: 32 }]);
    expect(await db.collection('expenses').find({}).toArray()).toEqual(expenses);
    expect(await db.collection('payments').find({}).toArray()).toEqual(payments);
    expect((await db.collection('trips').findOne({ _id: trip }))!.members[0].budget).toBe(123);
  });
  it('concurrent same UUID commits one receipt and lost response replays without changing newer Web settings', async () => {
    const input = await body();
    const results = await Promise.all(Array.from({ length: 4 }, () => write(input)));
    expect(results.every((r) => r.revision === results[0].revision)).toBe(true);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(1);
    await setCurrencySettingsForActor(db, actor.toString(), trip.toString(), {});
    expect(await write(input)).toEqual(results[0]);
    expect((await context()).settings).toBeNull();
    await expect(
      write({ ...input, settings: { ...input.settings, default_currency: 'USD' } })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await readTripMutation(db, peer.toString(), input.client_request_id)).toEqual({
      status: 'not_found',
    });
  });
  it('Web settings invalidate Mobile revision, unrelated trip updates do not', async () => {
    const input = await body();
    await updateTripForActor(db, actor.toString(), trip.toString(), { name: 'New name' });
    expect((await context()).revision).toBe(input.expected_revision);
    await setCurrencySettingsForActor(db, actor.toString(), trip.toString(), input.settings);
    await expect(write(input)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_CHANGED',
    });
  });
  it('competing different UUID settings allow only one current revision', async () => {
    const input = await body();
    const results = await Promise.allSettled([
      write(input),
      write({
        ...input,
        client_request_id: randomUUID(),
        settings: { ...input.settings, default_currency: 'USD' },
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(2);
  });
  it('admin loss rejects new writes but permits original receipt; removal denies both', async () => {
    const input = await body();
    await write(input);
    await db
      .collection('trips')
      .updateOne({ _id: trip, 'members.user': actor }, { $set: { 'members.$.role': 'member' } });
    expect(await write(input)).toMatchObject({ tripId: trip.toString() });
    const rejected = await body();
    await expect(write(rejected)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await readTripMutation(db, actor.toString(), rejected.client_request_id)).toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      setCurrencySettingsForActor(db, peer.toString(), trip.toString(), {})
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as mongo.Document);
    await expect(write(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readTripMutation(db, actor.toString(), input.client_request_id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('unsupported currency is a terminal rejection and cannot change settings', async () => {
    const input = await body();
    input.settings.currencies[0].code = 'ZZZ';
    await expect(write(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await context()).settings).toBeNull();
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('receipt failure rolls back settings under the parent transaction', async () => {
    const original = db.collection.bind(db),
      broken = Object.create(db) as mongo.Db;
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
    await expect(write(await body(), actor, broken)).rejects.toThrow('disk full');
    expect((await context()).settings).toBeNull();
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(0);
  });
});
