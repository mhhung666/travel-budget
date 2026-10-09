// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
import { readBudget } from '@/lib/budgetRead';
import { writeWebSettings } from '@/lib/webSettingsWrite';
import { readTripMutation } from '@/lib/tripEntry';
import { computeBudgetProgress } from '@/lib/budget';
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'budget-isolated-test-secret-with-at-least-32-chars' }),
}));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed)) throw new Error('Isolated URI and opt-in required');
describe.skipIf(!uri || !allowed)('G4a private budget transactions', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    trip = new mongo.ObjectId();
  const read = (id = actor) => withLedgerV2(() => readBudget(db, id.toString(), trip.toString()));
  const write = (body: object, id = actor, database = db) =>
    withLedgerV2(() => writeWebSettings(database, id.toString(), trip.toString(), 'budget', body));
  const body = async (base = 'TWD') => ({
    client_request_id: randomUUID(),
    expected_revision: (await read()).revision,
    base_currency: base,
    total: 100,
    categories: [{ category: 'food', amount: 80 }],
  });
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_budget_${randomUUID().replaceAll('-', '')}`);
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
    for (const name of ['trips', 'expenses', 'payments', 'mutationrequests'])
      await db.collection(name).deleteMany({});
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'TEST budget',
      hashCode: 'secret',
      members: [
        { user: actor, role: 'member', budget: null },
        { user: peer, role: 'admin', budget: { total: 987654, categories: [] } },
      ],
    });
  });
  it.each(['TWD', 'USD', 'JPY'])(
    'uses all rows, the shared Web calculator and only actor shares in %s',
    async (base) => {
      await db
        .collection('trips')
        .updateOne(
          { _id: trip },
          { $set: { baseCurrency: base, 'members.1.budget.baseCurrency': base } }
        );
      const rows = Array.from({ length: 25 }, (_, i) => ({
        trip,
        baseCurrency: base,
        amount: 100.01,
        category: i === 24 ? 'historic' : 'food',
        splits: [
          { user: actor, shareAmount: 33.335 },
          { user: peer, shareAmount: 66.675 },
        ],
      }));
      await db.collection('expenses').insertMany(rows);
      await db.collection('payments').insertOne({ trip, baseCurrency: base, amount: 999 });
      expect((await write(await body(base))).status).toBe('committed');
      const data = await read();
      const expected = computeBudgetProgress(
        data.budget,
        rows.map((r) => ({
          ...r,
          splits: r.splits.map((s) => ({
            user_id: s.user.toString(),
            share_amount: s.shareAmount,
          })),
        })),
        actor.toString()
      );
      expect(data.progress.totalSpent).toBe(expected.totalSpent);
      expect(data.progress.categories.map(({ remaining: _remaining, ...c }) => c)).toEqual(
        expected.categories
      );
      expect(data.progress.remaining).toBeLessThan(0);
      expect(data.ledger.baseCurrency).toBe(base);
      expect(JSON.stringify(data)).not.toMatch(/987654|secret|members|hashCode/);
      expect((await read(peer)).budget?.total).toBe(987654);
    }
  );
  it('concurrent identical UUID commits once, replays the original result after a newer Web write', async () => {
    const input = await body();
    const results = await Promise.all(Array.from({ length: 3 }, () => write(input)));
    expect(results.every((r) => JSON.stringify(r) === JSON.stringify(results[0]))).toBe(true);
    expect(await db.collection('mutationrequests').countDocuments()).toBe(1);
    await write({ ...(await body()), total: 150 });
    expect(await write(input)).toEqual(results[0]);
    expect((await read()).budget?.total).toBe(150);
    await expect(write({ ...input, total: 125 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(
      await withLedgerV2(() => readTripMutation(db, peer.toString(), input.client_request_id))
    ).toEqual({ status: 'not_found' });
  });
  it('other member changes do not conflict, same member Web changes persist a terminal conflict; zero clears', async () => {
    const input = await body();
    await write(
      {
        ...input,
        client_request_id: randomUUID(),
        expected_revision: (await read(peer)).revision,
        total: 300,
      },
      peer
    );
    expect((await read()).revision).toBe(input.expected_revision);
    await write({ ...(await body()), total: 200 });
    expect(await write(input)).toMatchObject({ status: 'rejected', code: 'RESOURCE_CHANGED' });
    expect(
      await withLedgerV2(() => readTripMutation(db, actor.toString(), input.client_request_id))
    ).toMatchObject({ status: 'rejected', code: 'RESOURCE_CHANGED' });
    await write({ ...(await body()), total: 0, categories: [{ category: 'food', amount: 0 }] });
    expect((await read()).budget).toBeNull();
  });
  it('revocation blocks context, writing and original receipt reads', async () => {
    const input = await body();
    await write(input);
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as never);
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(write(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withLedgerV2(() => readTripMutation(db, actor.toString(), input.client_request_id))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('receipt failure rolls back the budget and permits retry of the original UUID', async () => {
    const input = await body();
    const proxy = new Proxy(db, {
      get(target, prop) {
        if (prop === 'collection')
          return (name: string) =>
            name === 'mutationrequests'
              ? new Proxy(target.collection(name), {
                  get(c, key) {
                    return key === 'insertOne'
                      ? async () => {
                          throw new Error('disk fault');
                        }
                      : typeof Reflect.get(c, key) === 'function'
                        ? Reflect.get(c, key).bind(c)
                        : Reflect.get(c, key);
                  },
                })
              : target.collection(name);
        return Reflect.get(target, prop);
      },
    });
    await expect(write(input, actor, proxy)).rejects.toThrow('disk fault');
    expect((await read()).budget).toBeNull();
    expect(await db.collection('mutationrequests').countDocuments()).toBe(0);
    expect((await write(input)).status).toBe('committed');
  });
});
