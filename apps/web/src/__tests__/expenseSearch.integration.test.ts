// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withLedgerV2 } from '@/lib/ledger';
import { readExpenseSearch } from '@/lib/expenseSearch';
import { computeBudgetProgress } from '@/lib/budget';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed)) throw new Error('Isolated URI and opt-in required');
describe.skipIf(!uri || !allowed)('G4b authorized full-trip search snapshot', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    removed = new mongo.ObjectId(),
    trip = new mongo.ObjectId(),
    other = new mongo.ObjectId();
  const read = (input: Parameters<typeof readExpenseSearch>[3] = { keyword: '' }, id = actor) =>
    withLedgerV2(() => readExpenseSearch(db, id.toString(), trip.toString(), input));
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_search_${randomUUID().replaceAll('-', '')}`);
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
    for (const name of ['trips', 'expenses', 'payments', 'users'])
      await db.collection(name).deleteMany({});
    await db.collection('users').insertMany([
      { _id: actor, displayName: '同名', username: 'PRIVATE-A', email: 'private-a@example.test' },
      { _id: peer, displayName: '同名', isVirtual: true, username: 'PRIVATE-B' },
    ]);
    await db.collection('trips').insertOne({
      _id: trip,
      members: [
        { user: actor, role: 'member', budget: { total: 876543, categories: [] } },
        { user: peer, role: 'admin' },
      ],
      hashCode: 'PRIVATE-HASH',
    });
  });
  it.each(['TWD', 'USD', 'JPY'])(
    'reads all matching rows and normalized own shares in %s with tied dates and no private fields',
    async (base) => {
      await db
        .collection('trips')
        .updateOne(
          { _id: trip },
          { $set: { baseCurrency: base, 'members.0.budget.baseCurrency': base } }
        );
      const rows = Array.from({ length: 65 }, (_, i) => ({
        trip,
        baseCurrency: base,
        amount: 100.01,
        description: i === 64 ? 'Coffee [x].*' : '晚餐',
        category: i === 64 ? 'historical' : 'food',
        date: new Date(i === 64 ? '2026-10-08T23:59:59Z' : '2026-10-09'),
        createdAt: new Date('2026-10-09'),
        payer: i === 63 ? removed : i % 2 ? peer : actor,
        splits: [
          { user: actor, shareAmount: 33.335 },
          { user: peer, shareAmount: 66.675 },
        ],
        attachments: [{ key: 'PRIVATE-KEY' }],
        tags: ['PRIVATE-TAG'],
      }));
      await db.collection('expenses').insertMany(rows);
      await db.collection('expenses').insertOne({
        ...rows[0],
        _id: new mongo.ObjectId(),
        trip: other,
        description: 'PRIVATE-OTHER',
        amount: 999999,
      });
      await db.collection('payments').insertOne({ trip, baseCurrency: base, amount: 500 });
      const first = await read();
      expect(first.ledger.baseCurrency).toBe(base);
      expect(first.items).toHaveLength(20);
      expect(first.summary.count).toBe(65);
      expect(first.summary.total).toBe(6500.65);
      const expected = computeBudgetProgress(
        null,
        rows.map((r) => ({
          category: r.category,
          amount: r.amount,
          splits: r.splits.map((s) => ({
            user_id: s.user.toString(),
            share_amount: s.shareAmount,
          })),
        })),
        actor.toString()
      );
      expect(first.summary.mySpent).toBe(expected.totalSpent);
      expect(JSON.stringify(first)).not.toMatch(
        /PRIVATE|876543|email|username|budget|attachments|tags/
      );
      expect(first.payers).toContainEqual({ userId: null, displayName: '' });
      expect(first.payers).toContainEqual({
        userId: peer.toString(),
        displayName: '同名',
        isVirtual: true,
      });
      const seen = [...first.items];
      let cursor = first.nextCursor;
      while (cursor) {
        const page = await read({ keyword: '', cursor });
        expect(page.summary).toEqual(first.summary);
        seen.push(...page.items);
        cursor = page.nextCursor;
      }
      expect(seen).toHaveLength(65);
      expect(new Set(seen.map((e) => e.id)).size).toBe(65);
      const matched = await read({
        keyword: '[x].*',
        category: 'other',
        payerId: actor.toString(),
        dateFrom: '2026-10-08',
        dateTo: '2026-10-08',
      });
      expect(matched.summary.count).toBe(1);
      expect(matched.summary.total).toBe(100.01);
      expect((await read({ keyword: '', payerId: 'missing' })).summary.count).toBe(1);
      expect((await read({ keyword: 'PRIVATE-TAG' })).summary.count).toBe(0);
      expect(await db.collection('mutationrequests').countDocuments()).toBe(0);
      expect(
        (await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence
      ).toBeUndefined();
    }
  );
  it('refuses another actor and revoked access including an existing page cursor', async () => {
    await expect(read({ keyword: '' }, removed)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await read();
    await db
      .collection<{ _id: mongo.ObjectId; members: { user: mongo.ObjectId }[] }>('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } });
    await expect(read()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('an edit, deletion or payer rename invalidates an earlier cursor, while refresh returns a coherent new result', async () => {
    await db.collection('expenses').insertMany(
      Array.from({ length: 21 }, () => ({
        trip,
        amount: 1,
        description: 'old',
        date: new Date('2026-10-09'),
        createdAt: new Date('2026-10-09'),
        payer: actor,
        splits: [{ user: actor, shareAmount: 1 }],
      }))
    );
    const first = await read();
    await db.collection('users').updateOne({ _id: actor }, { $set: { displayName: 'new' } });
    await expect(read({ keyword: '', cursor: first.nextCursor! })).rejects.toThrow();
    const next = await read();
    await db.collection('expenses').deleteOne({ trip });
    await expect(read({ keyword: '', cursor: next.nextCursor! })).rejects.toThrow();
    expect((await read()).summary.count).toBe(20);
  });
  it('rejects a corrupt ledger outside the search result rather than mixing currencies', async () => {
    await db.collection('expenses').insertOne({
      trip,
      baseCurrency: 'USD',
      amount: 100,
      description: 'excluded',
      date: new Date(),
      createdAt: new Date(),
      payer: actor,
      splits: [],
    });
    await expect(read({ keyword: 'unmatched' })).rejects.toMatchObject({
      code: 'LEDGER_DATA_INVALID',
    });
  });
});
