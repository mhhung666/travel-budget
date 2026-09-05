// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mongo } from 'mongoose';
import {
  createExpenseDeliveryQueue,
  initialExpenseDeliveryState,
  EXPENSE_DELIVERY_INDEX,
  EXPENSE_DELIVERY_MAX_ATTEMPTS,
  type ExpenseDeliveryRecord,
} from '@/lib/expenseDeliveryQueue';

// Never read dotenv or fall back to the app URI. Only a fresh random database is disposable.
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Queue integration requires explicit URI and write opt-in');

describe.skipIf(!uri || !allowed)('expense queue isolated MongoDB', () => {
  let client: mongo.MongoClient;
  let db: mongo.Db;
  let collection: mongo.Collection<ExpenseDeliveryRecord>;
  let queue: ReturnType<typeof createExpenseDeliveryQueue>;
  let owned = false;

  beforeAll(async () => {
    client = new mongo.MongoClient(uri!, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    await client.connect();
    db = client.db(`tb_queue_verify_${randomUUID().replaceAll('-', '')}`);
    expect(await db.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    collection = db.collection<ExpenseDeliveryRecord>('expenses');
    await collection.createIndex(EXPENSE_DELIVERY_INDEX.key, { name: EXPENSE_DELIVERY_INDEX.name });
    queue = createExpenseDeliveryQueue(collection);
  });

  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  async function insert(attempts = 0) {
    const _id = new mongo.ObjectId();
    await collection.insertOne({
      _id,
      expenseDelivery: { ...initialExpenseDeliveryState(), attempts },
    });
    return _id;
  }
  async function expire(_id: mongo.ObjectId) {
    await collection.updateOne({ _id }, { $set: { 'expenseDelivery.availableAt': new Date(0) } });
  }
  async function claim() {
    const job = await queue.claim();
    expect(job?.expenseDelivery?.token).toEqual(expect.any(String));
    return { id: job!._id, token: job!.expenseDelivery!.token! };
  }

  it('gives exactly one of 12 concurrent claimers the job', async () => {
    const id = await insert();
    const results = await Promise.all(Array.from({ length: 12 }, () => queue.claim()));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await collection.findOne({ _id: id }))?.expenseDelivery?.attempts).toBe(1);
  });

  it('rejects expired tokens before and after takeover', async () => {
    await insert();
    const old = await claim();
    await expire(old.id);
    expect(await queue.renew(old.id, old.token)).toBe(false);
    expect(await queue.complete(old.id, old.token)).toBe(false);
    expect(await queue.fail(old.id, old.token, 'worker_error')).toBe(false);
    const next = await claim();
    expect(next.token).not.toBe(old.token);
    expect(await queue.complete(old.id, old.token)).toBe(false);
    expect(await queue.fail(old.id, old.token, 'worker_error')).toBe(false);
    expect(await queue.renew(old.id, old.token)).toBe(false);
    expect(await queue.complete(next.id, next.token)).toBe(true);
    expect(await queue.claim()).toBeNull();
  });

  it('supports renewal and prevents duplicate completion', async () => {
    await insert();
    const current = await claim();
    expect(await queue.renew(current.id, current.token)).toBe(true);
    expect(await queue.complete(current.id, current.token)).toBe(true);
    expect(await queue.complete(current.id, current.token)).toBe(false);
    expect(await queue.renew(current.id, current.token)).toBe(false);
  });

  it('backs off retries and archives the fifth failure', async () => {
    const id = await insert();
    for (let attempt = 1; attempt <= EXPENSE_DELIVERY_MAX_ATTEMPTS; attempt++) {
      const current = await claim();
      expect(await queue.fail(current.id, current.token, 'delivery_failed')).toBe(true);
      const state = (await collection.findOne({ _id: id }))!.expenseDelivery!;
      expect(state.attempts).toBe(attempt);
      expect(state.status).toBe(attempt === EXPENSE_DELIVERY_MAX_ATTEMPTS ? 'dead' : 'pending');
      expect(state.availableAt.getTime() - state.updatedAt!.getTime()).toBe(
        30_000 * 2 ** (attempt - 1)
      );
      expect(state.token).toBeNull();
      expect(await queue.claim()).toBeNull();
      await expire(id);
    }
    expect(await queue.claim()).toBeNull();
  });

  it('archives an expired final attempt once, even with concurrent reapers', async () => {
    const id = await insert(EXPENSE_DELIVERY_MAX_ATTEMPTS - 1);
    await claim();
    expect(await queue.reapExpired()).toBeNull();
    await expire(id);
    expect(await queue.claim()).toBeNull();
    const results = await Promise.all([queue.reapExpired(), queue.reapExpired()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await collection.findOne({ _id: id }))?.expenseDelivery).toMatchObject({
      status: 'dead',
      lastError: 'lease_expired',
      token: null,
    });
  });

  it('never claims historical expenses, future jobs or terminal jobs', async () => {
    const states = [
      undefined,
      { ...initialExpenseDeliveryState(), availableAt: new Date('2999-01-01') },
      { ...initialExpenseDeliveryState(), status: 'done' as const },
      { ...initialExpenseDeliveryState(), status: 'dead' as const },
    ];
    await collection.insertMany(
      states.map((state) => ({
        _id: new mongo.ObjectId(),
        ...(state ? { expenseDelivery: state } : {}),
      }))
    );
    expect(await queue.claim()).toBeNull();
    expect(await queue.reapExpired()).toBeNull();
    expect(await collection.countDocuments()).toBe(4);
  });

  it('does not recreate a deleted expense from a stale worker', async () => {
    await insert();
    const current = await claim();
    await collection.deleteOne({ _id: current.id });
    expect(await queue.complete(current.id, current.token)).toBe(false);
    expect(await queue.fail(current.id, current.token, 'worker_error')).toBe(false);
    expect(await queue.renew(current.id, current.token)).toBe(false);
    expect(await collection.countDocuments()).toBe(0);
  });
});
