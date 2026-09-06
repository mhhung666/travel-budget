// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { createExpenseDeliveryEvent } from '@/lib/expenseDeliveryEvent';
import {
  createExpensePushCheckpoint,
  EXPENSE_PUSH_CHECKPOINT_LIMIT,
} from '@/lib/expensePushCheckpoint';
import { createExpenseEventStore, EXPENSE_EVENT_INDEXES } from '@/lib/expenseEventStore';
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
    const hello = await client.db('admin').command({ hello: 1 });
    if (!hello.setName) throw new Error('Isolated queue integration now requires a replica set');
    db = client.db(`tb_queue_verify_${randomUUID().replaceAll('-', '')}`);
    expect(await db.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    collection = db.collection<ExpenseDeliveryRecord>('expenses');
    await collection.createIndex(EXPENSE_DELIVERY_INDEX.key, { name: EXPENSE_DELIVERY_INDEX.name });
    for (const { collection: name, ...definition } of EXPENSE_EVENT_INDEXES) {
      const { key, ...options } = definition;
      await db.collection(name).createIndex(key, options);
    }
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
    for (const name of ['notifications', 'activitylogs', 'trips', 'users']) {
      await db.collection(name).deleteMany({});
    }
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

  it('checkpoints terminal devices once and retains progress across takeover', async () => {
    await insert();
    const lease = await claim();
    const store = createExpensePushCheckpoint(collection);
    const device = new mongo.ObjectId().toHexString();
    expect(await store.record(lease.id, lease.token, device, 'accepted')).toBe(false);
    expect(await store.read(lease.id, lease.token)).toBeNull();
    await collection.updateOne(
      { _id: lease.id },
      { $set: { 'expenseDelivery.recordsPersistedAt': new Date() } }
    );
    expect(await store.read(lease.id, lease.token)).toEqual({});
    expect(await store.record(lease.id, lease.token, device, 'accepted')).toBe(true);
    const first = await store.read(lease.id, lease.token);
    expect(first?.[device]).toEqual({ status: 'accepted', recordedAt: expect.any(Date) });
    await Promise.all(
      Array.from({ length: 12 }, () => store.record(lease.id, lease.token, device, 'expired'))
    );
    expect(await store.read(lease.id, lease.token)).toEqual(first);
    await expire(lease.id);
    expect(await store.read(lease.id, lease.token)).toBeNull();
    expect(await store.record(lease.id, lease.token, device, 'expired')).toBe(false);
    const next = await claim();
    expect(await store.record(lease.id, lease.token, device, 'expired')).toBe(false);
    expect(await store.read(next.id, next.token)).toEqual(first);
    const expiredDevice = new mongo.ObjectId().toHexString();
    expect(await store.record(next.id, next.token, expiredDevice, 'expired')).toBe(true);
    expect((await store.read(next.id, next.token))?.[expiredDevice].status).toBe('expired');
    await queue.complete(next.id, next.token);
    expect(await store.record(next.id, next.token, device, 'accepted')).toBe(false);
    await collection.deleteOne({ _id: next.id });
    expect(await store.record(next.id, next.token, device, 'accepted')).toBe(false);
    expect(await collection.countDocuments({})).toBe(0);
  });

  it('atomically bounds device checkpoints while permitting duplicate acknowledgements', async () => {
    await insert();
    const lease = await claim();
    const store = createExpensePushCheckpoint(collection);
    const existing = Object.fromEntries(
      Array.from({ length: EXPENSE_PUSH_CHECKPOINT_LIMIT - 1 }, () => [
        new mongo.ObjectId().toHexString(),
        { status: 'accepted' as const, recordedAt: new Date() },
      ])
    );
    await collection.updateOne(
      { _id: lease.id },
      {
        $set: {
          'expenseDelivery.recordsPersistedAt': new Date(),
          'expenseDelivery.pushCheckpoints': existing,
        },
      }
    );
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        store.record(lease.id, lease.token, new mongo.ObjectId().toHexString(), 'accepted')
      )
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(Object.keys((await store.read(lease.id, lease.token))!)).toHaveLength(
      EXPENSE_PUSH_CHECKPOINT_LIMIT
    );
    expect(await store.record(lease.id, lease.token, Object.keys(existing)[0], 'expired')).toBe(
      true
    );
  });

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

  async function eventFixture() {
    const expenseId = await insert();
    const tripId = new mongo.ObjectId();
    const actor = new mongo.ObjectId();
    const recipient = new mongo.ObjectId();
    const second = new mongo.ObjectId();
    const event = createExpenseDeliveryEvent({
      expenseId: expenseId.toHexString(),
      tripId: tripId.toHexString(),
      actorId: actor.toHexString(),
      actorName: 'Original actor',
      tripName: 'Original trip',
      tripHashCode: 'trip-code',
      memberIds: [actor, recipient, second].map((id) => id.toHexString()),
      description: 'Original dinner',
      amount: 120,
      occurredAt: new Date('2026-09-05T12:00:00Z'),
    });
    await db.collection('expenses').updateOne(
      { _id: expenseId },
      {
        $set: {
          trip: tripId,
          createdBy: actor,
          expenseDeliveryEvent: event,
          description: 'Edited dinner',
          amount: 999,
        },
      }
    );
    await db.collection('trips').insertOne({
      _id: tripId,
      name: 'Renamed trip',
      members: [actor, recipient, second].map((user) => ({ user })),
    });
    await db
      .collection('users')
      .insertMany([actor, recipient, second].map((_id) => ({ _id, isVirtual: false })));
    const lease = await claim();
    const store = await createExpenseEventStore(db);
    return { expenseId, tripId, actor, recipient, second, event, lease, store };
  }

  it('deduplicates 12 concurrent replays using event unique indexes', async () => {
    const { store, lease } = await eventFixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => store.persist(lease.id, lease.token))
    );
    expect(results.every((result) => result.status === 'persisted')).toBe(true);
    expect(await db.collection('notifications').countDocuments()).toBe(2);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
  });

  it('preserves read state and original event metadata after edits and replay', async () => {
    const { store, lease, event } = await eventFixture();
    await store.persist(lease.id, lease.token);
    await db.collection('notifications').updateMany({}, { $set: { read: true } });
    await store.persist(lease.id, lease.token);
    const notifications = await db.collection('notifications').find().toArray();
    expect(notifications).toHaveLength(2);
    for (const notification of notifications) {
      expect(notification).toMatchObject({
        read: true,
        actorName: 'Original actor',
        tripName: 'Original trip',
        createdAt: event.occurredAt,
        meta: { description: 'Original dinner', amount: 120 },
      });
    }
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
  });

  it('excludes removed, nonexistent, virtual and newly joined recipients', async () => {
    const { store, lease, recipient, second, tripId } = await eventFixture();
    const newcomer = new mongo.ObjectId();
    await db.collection('users').insertOne({ _id: newcomer, isVirtual: false });
    await db.collection('users').updateOne({ _id: second }, { $set: { isVirtual: true } });
    await db
      .collection('trips')
      .updateOne(
        { _id: tripId },
        { $set: { members: [second, newcomer].map((user) => ({ user })) } }
      );
    expect(await store.persist(lease.id, lease.token)).toEqual({
      status: 'persisted',
      recipients: [],
    });
    await db
      .collection('trips')
      .updateOne({ _id: tripId }, { $set: { members: [{ user: recipient }] } });
    await db.collection('users').deleteOne({ _id: recipient });
    expect(await store.persist(lease.id, lease.token)).toEqual({
      status: 'persisted',
      recipients: [],
    });
    expect(await db.collection('notifications').countDocuments()).toBe(0);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
  });

  it('rolls back partial fan-out and retries the entire event atomically', async () => {
    const { store, lease, second } = await eventFixture();
    await db.command({ collMod: 'notifications', validator: { user: { $ne: second } } });
    try {
      await expect(store.persist(lease.id, lease.token)).rejects.toMatchObject({ code: 121 });
      expect(await db.collection('activitylogs').countDocuments()).toBe(0);
      expect(await db.collection('notifications').countDocuments()).toBe(0);
      expect(
        (await collection.findOne({ _id: lease.id }))?.expenseDelivery?.recordsPersistedAt
      ).toBeUndefined();
    } finally {
      await db.command({ collMod: 'notifications', validator: {} });
    }
    await store.persist(lease.id, lease.token);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect(await db.collection('notifications').countDocuments()).toBe(2);
  });

  it('skips invalid leases, missing expenses and missing trips', async () => {
    const { store, lease, tripId } = await eventFixture();
    expect((await store.persist(lease.id, 'wrong-token')).status).toBe('skipped');
    expect((await store.persist(new mongo.ObjectId(), lease.token)).status).toBe('skipped');
    await db.collection('trips').deleteOne({ _id: tripId });
    expect(await store.persist(lease.id, lease.token)).toEqual({
      status: 'skipped',
      reason: 'trip_missing',
    });
    expect(await db.collection('activitylogs').countDocuments()).toBe(0);
    expect(await db.collection('notifications').countDocuments()).toBe(0);
  });

  it('rejects event ownership mismatch before writing side effects', async () => {
    const { store, lease } = await eventFixture();
    await db
      .collection('expenses')
      .updateOne(
        { _id: lease.id },
        { $set: { 'expenseDeliveryEvent.tripId': new mongo.ObjectId().toHexString() } }
      );
    await expect(store.persist(lease.id, lease.token)).rejects.toThrow('ownership mismatch');
    expect(await db.collection('activitylogs').countDocuments()).toBe(0);
  });

  it('preserves legacy records outside the partial indexes', async () => {
    await db.collection('notifications').insertMany([{ read: true }, { read: false }]);
    await db
      .collection('activitylogs')
      .insertMany([{ type: 'expense_added' }, { type: 'expense_added' }]);
    const { store, lease } = await eventFixture();
    await store.persist(lease.id, lease.token);
    expect(await db.collection('notifications').countDocuments()).toBe(4);
    expect(await db.collection('activitylogs').countDocuments()).toBe(3);
  });

  it('refuses to initialize without unique event indexes', async () => {
    const definition = EXPENSE_EVENT_INDEXES[0];
    await db.collection(definition.collection).dropIndex(definition.name);
    try {
      await expect(createExpenseEventStore(db)).rejects.toThrow('Required expense event index');
    } finally {
      const { collection: name, key, ...options } = definition;
      await db.collection(name).createIndex(key, options);
    }
  });

  it('does not resurrect deleted notifications or activities when replaying completed records', async () => {
    const { store, lease } = await eventFixture();
    await store.persist(lease.id, lease.token);
    await db.collection('notifications').deleteMany({});
    await db.collection('activitylogs').deleteMany({});
    await store.persist(lease.id, lease.token);
    expect(await db.collection('notifications').countDocuments()).toBe(0);
    expect(await db.collection('activitylogs').countDocuments()).toBe(0);
    expect(
      (await collection.findOne({ _id: lease.id }))?.expenseDelivery?.recordsPersistedAt
    ).toBeInstanceOf(Date);
  });

  it('does not backfill a removed then rejoined recipient after records commit', async () => {
    const { store, lease, tripId, recipient, second } = await eventFixture();
    await db
      .collection('trips')
      .updateOne({ _id: tripId }, { $pull: { members: { user: recipient } } } as mongo.Document);
    expect(await store.persist(lease.id, lease.token)).toEqual({
      status: 'persisted',
      recipients: [second.toHexString()],
    });
    await db
      .collection('trips')
      .updateOne({ _id: tripId }, { $push: { members: { user: recipient } } } as mongo.Document);
    expect(await store.persist(lease.id, lease.token)).toEqual({
      status: 'persisted',
      recipients: [second.toHexString()],
    });
    expect(await db.collection('notifications').countDocuments()).toBe(1);
  });

  it.each(['member_removed', 'trip_deleting'])(
    'retries stale trip reads after %s between expense and trip locks',
    async (change) => {
      const { store, lease, tripId, recipient, second } = await eventFixture();
      const original = mongo.Collection.prototype.findOneAndUpdate;
      let injected = false;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
        .mockImplementation(async function (
          this: mongo.Collection,
          ...args: Parameters<typeof original>
        ) {
          if (this.collectionName === 'trips' && !injected) {
            injected = true;
            await db
              .collection('trips')
              .updateOne(
                { _id: tripId },
                change === 'member_removed'
                  ? ({ $pull: { members: { user: recipient } } } as mongo.Document)
                  : { $set: { expenseDeliveryDeleting: true } }
              );
          }
          return original.apply(this, args);
        });
      try {
        const result = await store.persist(lease.id, lease.token);
        expect(injected).toBe(true);
        if (change === 'member_removed') {
          expect(result).toEqual({ status: 'persisted', recipients: [second.toHexString()] });
          expect(await db.collection('notifications').countDocuments({ user: recipient })).toBe(0);
        } else {
          expect(result.status).toBe('skipped');
          expect(await db.collection('notifications').countDocuments()).toBe(0);
          expect(await db.collection('activitylogs').countDocuments()).toBe(0);
        }
      } finally {
        spy.mockRestore();
      }
    }
  );

  it('rolls back notifications when the lease expires during fan-out', async () => {
    const { store, lease } = await eventFixture();
    await collection.updateOne({ _id: lease.id }, [
      { $set: { 'expenseDelivery.availableAt': { $add: ['$$NOW', 500] } } },
    ]);
    const original = mongo.Collection.prototype.updateOne;
    let paused = false;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'updateOne')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (this.collectionName === 'notifications' && !paused) {
          paused = true;
          await new Promise((resolve) => setTimeout(resolve, 650));
        }
        return original.apply(this, args);
      });
    try {
      expect(await store.persist(lease.id, lease.token)).toEqual({
        status: 'skipped',
        reason: 'lease_expired',
      });
      expect(paused).toBe(true);
      expect(await db.collection('notifications').countDocuments()).toBe(0);
      expect(await db.collection('activitylogs').countDocuments()).toBe(0);
      expect(
        (await collection.findOne({ _id: lease.id }))?.expenseDelivery?.recordsPersistedAt
      ).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['member_removed', 'trip_deleted'])(
    'finishes records before a waiting %s cleans them up',
    async (change) => {
      const { store, lease, tripId, recipient } = await eventFixture();
      const original = mongo.Collection.prototype.updateOne;
      let started = false;
      let finished = false;
      let cleanup: Promise<void> | undefined;
      let cleanupError: unknown;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'updateOne')
        .mockImplementation(async function (
          this: mongo.Collection,
          ...args: Parameters<typeof original>
        ) {
          if (this.collectionName === 'notifications' && !started) {
            started = true;
            cleanup = (async () => {
              if (change === 'member_removed') {
                await db.collection('trips').updateOne({ _id: tripId }, {
                  $pull: { members: { user: recipient } },
                } as mongo.Document);
                await db.collection('notifications').deleteMany({ trip: tripId, user: recipient });
              } else {
                await db
                  .collection('trips')
                  .updateOne({ _id: tripId }, { $set: { expenseDeliveryDeleting: true } });
                await Promise.all(
                  ['expenses', 'notifications', 'activitylogs'].map((name) =>
                    db.collection(name).deleteMany({ trip: tripId })
                  )
                );
                await db.collection('trips').deleteOne({ _id: tripId });
              }
              finished = true;
            })().catch((error) => {
              cleanupError = error;
            });
            // Allow the outside write to reach MongoDB: it must wait for this transaction's Trip lock.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(finished).toBe(false);
          }
          return original.apply(this, args);
        });
      try {
        expect((await store.persist(lease.id, lease.token)).status).toBe('persisted');
      } finally {
        spy.mockRestore();
        await cleanup;
      }
      expect(cleanupError).toBeUndefined();
      expect(started && finished).toBe(true);
      expect(await db.collection('notifications').countDocuments({ user: recipient })).toBe(0);
      if (change === 'trip_deleted') {
        expect(await db.collection('activitylogs').countDocuments()).toBe(0);
        expect((await store.persist(lease.id, lease.token)).status).toBe('skipped');
      }
    }
  );
});
