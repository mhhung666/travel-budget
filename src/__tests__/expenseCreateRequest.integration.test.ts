// @vitest-environment node
import { up, down } from '../../migrations/20260912160000-expense-create-requests.js';
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTripWrite } from '@/lib/tripWriteTransaction';
import { withExpenseCreateRequest, EXPENSE_CREATE_REQUESTS } from '@/lib/expenseCreateRequest';
import { createExpenseSchema } from '@/lib/validation';
import { deleteTripAtomically } from '@/lib/tripDeletion';
import type { Expense } from '@/types';
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => {} }));
vi.unmock('next-intl');

// Only a fresh database on an explicitly supplied test server can be written/dropped.
const uri = process.env.MONGODB_QUEUE_TEST_URI;
const allowed = process.env.MONGODB_QUEUE_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit test URI and write opt-in required');

describe.skipIf(!uri || !allowed)('expense request transactions on isolated MongoDB', () => {
  let db: mongo.Db;
  let owned = false;
  const trip = new mongo.ObjectId();
  const actor = new mongo.ObjectId();
  const input = createExpenseSchema.parse({
    client_request_id: randomUUID(),
    payer_id: actor.toHexString(),
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    description: 'Dinner',
    category: 'food',
    date: '2026-09-12',
    splits: [{ user_id: actor.toHexString(), share_amount: 100 }],
  });
  const request = { tripId: trip.toHexString(), actorId: actor.toHexString(), input };
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_expense_request_${randomUUID().replaceAll('-', '')}`,
      serverSelectionTimeoutMS: 5000,
      autoIndex: false,
    });
    db = mongoose.connection.db!;
    if (!(await db.admin().command({ hello: 1 })).setName) throw new Error('Replica set required');
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    for (const name of ['trips', 'expenses', EXPENSE_CREATE_REQUESTS])
      await db.collection(name).deleteMany({});
    await db
      .collection('trips')
      .insertOne({ _id: trip, members: [{ user: actor, role: 'admin' }] });
  });
  function create(fail = false, override = request) {
    return withTripWrite(override.tripId, override.actorId, (session) =>
      withExpenseCreateRequest(db, session, override, async () => {
        const id = new mongo.ObjectId();
        await db
          .collection('expenses')
          .insertOne({ _id: id, trip, description: input.description }, { session });
        if (fail) throw new Error('abort after insert');
        return {
          data: {
            id: id.toHexString(),
            trip_id: trip.toHexString(),
            description: input.description,
          } as Expense,
        };
      })
    );
  }
  it('commits exactly one expense and result under eight simultaneous submissions', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => create()));
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.data.id)).size).toBe(1);
    expect(await db.collection('expenses').countDocuments()).toBe(1);
    expect(await db.collection(EXPENSE_CREATE_REQUESTS).countDocuments()).toBe(1);
  });
  it('rolls back both records on failure and permits the same request to retry', async () => {
    await expect(create(true)).rejects.toThrow('abort after insert');
    expect(await db.collection('expenses').countDocuments()).toBe(0);
    expect(await db.collection(EXPENSE_CREATE_REQUESTS).countDocuments()).toBe(0);
    expect((await create()).replayed).toBe(false);
    expect((await create()).replayed).toBe(true);
  });
  it('rolls back the expense if recording the result fails', async () => {
    await db.createCollection(EXPENSE_CREATE_REQUESTS).catch((error) => {
      if (error.code !== 48) throw error;
    });
    await db.command({
      collMod: EXPENSE_CREATE_REQUESTS,
      validator: { fingerprint: 'reject-all' },
    });
    try {
      await expect(create()).rejects.toMatchObject({ code: 121 });
      expect(await db.collection('expenses').countDocuments()).toBe(0);
      expect(await db.collection(EXPENSE_CREATE_REQUESTS).countDocuments()).toBe(0);
    } finally {
      await db.command({ collMod: EXPENSE_CREATE_REQUESTS, validator: {} });
    }
    expect((await create()).replayed).toBe(false);
  });
  it('migrates cleanup indexes repeatedly without dropping accepted requests on rollback', async () => {
    await up(db);
    await up(db);
    await create();
    await down(db);
    await down(db);
    expect((await create()).replayed).toBe(true);
    await up(db);
    expect(await db.collection(EXPENSE_CREATE_REQUESTS).indexes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'expense_create_request_trip', key: { trip: 1 } }),
      ])
    );
  });
  it('rejects changed payloads and revoked membership', async () => {
    await create();
    await expect(
      create(false, { ...request, input: { ...input, description: 'Changed' } })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
    await expect(create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.collection('expenses').countDocuments()).toBe(1);
  });
  it('never recreates a deleted expense, and removes receipts on trip deletion', async () => {
    const first = await create();
    await db.collection('expenses').deleteMany({ trip });
    expect(await create()).toEqual({ replayed: true, data: first.data });
    expect(await db.collection('expenses').countDocuments()).toBe(0);
    await deleteTripAtomically(db, trip.toHexString(), actor.toHexString());
    expect(await db.collection(EXPENSE_CREATE_REQUESTS).countDocuments()).toBe(0);
  });
});
