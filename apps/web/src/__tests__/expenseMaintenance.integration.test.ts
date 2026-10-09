// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as maintenance from '@/lib/expenseMaintenance';
import { computeSplits } from '@/lib/expenseSplit';
import * as entry from '@/lib/tripEntry';
import { authorizeLedger, withLedgerV2 } from '@/lib/ledger';
import { inLedgerContext } from '@/test/ledgerContext';
const { MUTATION_REQUESTS } = entry;
// Each call is one v2 request, as through the Web action or `/api/v2`.
const maintainExpense = inLedgerContext(maintenance.maintainExpense);
const readExpenseEditContext = inLedgerContext(maintenance.readExpenseEditContext);
const readTripMutation = inLedgerContext(entry.readTripMutation);
/** The revision covers the authorized trip unit (a trip without one is historical TWD). */
const expenseRevision = (...args: Parameters<typeof maintenance.expenseRevision>) =>
  withLedgerV2(() => {
    authorizeLedger({});
    return maintenance.expenseRevision(...args);
  });
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('E3 isolated replica-set transactions', () => {
  let client: mongo.MongoClient;
  let db: mongo.Db;
  let owned = false;
  const actor = new mongo.ObjectId();
  const peer = new mongo.ObjectId();
  const third = new mongo.ObjectId();
  const trip = new mongo.ObjectId();
  const expense = new mongo.ObjectId();
  const secret = 'e3-test-secret-with-domain-separation';
  const ids = [actor, peer, third];
  const read = () =>
    readExpenseEditContext(db, actor.toString(), trip.toString(), expense.toString(), secret);
  const update = async (changes: Record<string, unknown> = { description: 'updated' }) => ({
    base_currency: 'TWD',
    client_request_id: randomUUID(),
    expected_revision: (await read()).revision,
    mode: 'basic' as const,
    changes,
  });
  const write = (
    body: unknown,
    operation: 'expense.update' | 'expense.delete' = 'expense.update',
    who = actor
  ) =>
    maintainExpense(
      db,
      who.toString(),
      trip.toString(),
      expense.toString(),
      operation,
      body as never,
      secret,
      async () => undefined
    );
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_e3_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    for (const name of [
      'users',
      'trips',
      'expenses',
      'comments',
      'blobcleanupjobs',
      'activitylogs',
      MUTATION_REQUESTS,
      'expensecreaterequests',
    ])
      await db.createCollection(name);
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });
  beforeEach(async () => {
    for (const name of [
      'users',
      'trips',
      'expenses',
      'comments',
      'blobcleanupjobs',
      'activitylogs',
      MUTATION_REQUESTS,
      'expensecreaterequests',
    ])
      await db.collection(name).deleteMany({});
    await db
      .collection('users')
      .insertMany(ids.map((id) => ({ _id: id, displayName: 'Same name' })));
    await db.collection('trips').insertOne({
      _id: trip,
      members: ids.map((user) => ({ user, role: 'member', joinedAt: new Date('2026-01-01') })),
    });
    await db.collection('expenses').insertOne({
      _id: expense,
      trip,
      payer: actor,
      amount: 100,
      originalAmount: 100,
      currency: 'TWD',
      exchangeRate: 1,
      description: 'original',
      category: 'food',
      date: new Date('2026-10-06'),
      splits: [
        { user: actor, shareAmount: 80 },
        { user: peer, shareAmount: 20 },
      ],
      attachments: [
        {
          key: `receipts/${trip}/one.jpg`,
          uploadedBy: actor,
          size: 1,
          uploadedAt: new Date('2026-01-01'),
        },
      ],
      tags: ['keep'],
      itineraryDays: [new mongo.ObjectId()],
      createdBy: peer,
      createdAt: new Date('2026-01-01'),
      expenseDelivery: { state: 'queued' },
    });
  });
  it('metadata keeps raw foreign currency, non-equal shares, attachments, tags and itinerary', async () => {
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          currency: 'JPY',
          originalAmount: 400,
          exchangeRate: 0.25,
          category: 'legacy-category',
        },
      }
    );
    const before = await db.collection('expenses').findOne({ _id: expense });
    const context = await read();
    expect(context.capabilities).toMatchObject({
      equal: false,
      recalculate: false,
      reason: 'historical',
    });
    expect(context.category).toBe('legacy-category');
    await write(await update({ description: 'new', date: '2026-10-07' }));
    const after = await db.collection('expenses').findOne({ _id: expense });
    expect(after).toEqual({ ...before, description: 'new', date: new Date('2026-10-07') });
  });
  it('legacy missing money fields and dangling member only allow basic updates', async () => {
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $unset: { originalAmount: '', currency: '', exchangeRate: '' },
        $set: { payer: new mongo.ObjectId() },
      }
    );
    expect((await read()).capabilities.equal).toBe(false);
    await write(await update());
    const raw = await db.collection('expenses').findOne({ _id: expense });
    expect(raw).not.toHaveProperty('originalAmount');
    expect(raw!.payer.equals(actor)).toBe(false);
  });
  it('explicit equal mode validates the backend tail-cent rule (0.01 / three)', async () => {
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          splits: [
            { user: actor, shareAmount: 50 },
            { user: peer, shareAmount: 50 },
          ],
        },
      }
    );
    const body = {
      base_currency: 'TWD',
      client_request_id: randomUUID(),
      expected_revision: (await read()).revision,
      mode: 'equal',
      // v2 amount changes always restate the currency and rate.
      changes: {
        original_amount: 0.01,
        currency: 'TWD',
        exchange_rate: 1,
        payer_id: peer.toString(),
        splits: ids.map((id, i) => ({ user_id: id.toString(), share_amount: i === 0 ? 0.01 : 0 })),
      },
    };
    await write(body);
    const raw = await db.collection('expenses').findOne({ _id: expense });
    expect(raw!.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual([0.01, 0, 0]);
    expect(raw!.amount).toBe(0.01);
    expect(raw!.attachments).toHaveLength(1);
  });
  it('foreign expense cannot be converted and fake equal shares produce terminal refusal', async () => {
    const body = {
      base_currency: 'TWD',
      client_request_id: randomUUID(),
      expected_revision: (await read()).revision,
      mode: 'equal',
      changes: {
        original_amount: 100,
        currency: 'TWD',
        exchange_rate: 1,
        payer_id: actor.toString(),
        splits: [
          { user_id: actor.toString(), share_amount: 80 },
          { user_id: peer.toString(), share_amount: 20 },
        ],
      },
    };
    await expect(write(body)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION_ERROR',
    });
    expect((await read()).expense.description).toBe('original');
  });
  it.each(['description', 'tags', 'itineraryDays', 'payer', 'attachments', 'member-order'])(
    '%s change rejects old confirmation while delivery-state change does not',
    async (field) => {
      const body = await update();
      if (field === 'member-order')
        await db
          .collection('trips')
          .updateOne(
            { _id: trip },
            { $set: { members: [peer, actor, third].map((user) => ({ user, role: 'member' })) } }
          );
      else
        await db.collection('expenses').updateOne(
          { _id: expense },
          {
            $set: {
              [field]: field === 'payer' ? peer : field === 'description' ? 'web update' : [],
            },
          }
        );
      await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
      expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
        status: 'rejected',
        code: 'RESOURCE_CHANGED',
        tripId: trip.toString(),
      });
    }
  );
  it('outbox checkpoints do not change revision, and canonical key order is stable', async () => {
    const body = await update();
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          expenseDelivery: { state: 'sent' },
          expenseDeliveryEvent: { state: 'persisted' },
        },
      }
    );
    expect((await read()).revision).toBe(body.expected_revision);
    await write(body);
    const raw = await db.collection('expenses').findOne({ _id: expense });
    expect(expenseRevision(secret, trip.toString(), raw!, ids)).toBe(
      expenseRevision(
        secret,
        trip.toString(),
        Object.fromEntries(Object.entries(raw!).reverse()),
        ids
      )
    );
  });
  it('two different UUIDs based on one revision commit only one mutation', async () => {
    const body = await update();
    const results = await Promise.allSettled([
      write(body),
      write({
        ...body,
        base_currency: 'TWD',
        client_request_id: randomUUID(),
        changes: { description: 'other' },
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect((await db.collection('activitylogs').findOne({ trip }))?.actorName).toBe('Same name');
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(2);
  });
  it('same UUID concurrency/replay commits once, rejects changed payload and follows original result after later changes', async () => {
    const body = await update();
    const results = await Promise.all(Array.from({ length: 5 }, () => write(body)));
    expect(new Set(results.map((r) => r.revision)).size).toBe(1);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect((await db.collection('activitylogs').findOne({ trip }))?.actorName).toBe('Same name');
    await db.collection('expenses').updateOne({ _id: expense }, { $set: { description: 'later' } });
    expect(await write(body)).toEqual(results[0]);
    await expect(write({ ...body, changes: { description: 'different' } })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
  it('delete removes comments, retires blob once and retains creation receipt; cleanup failure still succeeds', async () => {
    await db.collection('comments').insertOne({ trip, expense });
    await db
      .collection<{ _id: string; expenseId: mongo.ObjectId }>('expensecreaterequests')
      .insertOne({ _id: 'creation', expenseId: expense });
    const input = {
      base_currency: 'TWD',
      client_request_id: randomUUID(),
      expected_revision: (await read()).revision,
    };
    const cleanup = vi.fn(async () => {
      throw new Error('R2 down');
    });
    const first = await maintainExpense(
      db,
      actor.toString(),
      trip.toString(),
      expense.toString(),
      'expense.delete',
      input,
      secret,
      cleanup
    );
    expect(first.deleted).toBe(true);
    expect(await db.collection('expenses').countDocuments()).toBe(0);
    expect(await db.collection('comments').countDocuments()).toBe(0);
    expect(await db.collection('blobcleanupjobs').countDocuments()).toBe(1);
    expect(await db.collection('expensecreaterequests').countDocuments()).toBe(1);
    expect(await write(input, 'expense.delete')).toEqual(first);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect((await db.collection('activitylogs').findOne({ trip }))?.actorName).toBe('Same name');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('another member deleting produces terminal RESOURCE_GONE, not travel revocation', async () => {
    const body = await update();
    await db.collection('expenses').deleteOne({ _id: expense });
    await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_GONE' });
    expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_GONE',
    });
  });
  it('revoked member cannot replay or lookup committed or rejected receipts', async () => {
    const body = await update();
    await write(body);
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as mongo.Document);
    await expect(write(body)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readTripMutation(db, actor.toString(), body.client_request_id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('receipt storage failure rolls back mutation/activity; deletion refusal is revision sensitive', async () => {
    const body = await update();
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
      maintainExpense(
        broken,
        actor.toString(),
        trip.toString(),
        expense.toString(),
        'expense.update',
        body as never,
        secret
      )
    ).rejects.toThrow('disk full');
    expect((await read()).expense.description).toBe('original');
    expect(await db.collection('activitylogs').countDocuments()).toBe(0);
    await db.collection('expenses').updateOne({ _id: expense }, { $set: { description: 'newer' } });
    await expect(
      write(
        {
          base_currency: 'TWD',
          client_request_id: randomUUID(),
          expected_revision: body.expected_revision,
        },
        'expense.delete'
      )
    ).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await db.collection('expenses').countDocuments()).toBe(1);
  });
  async function seedEqual(original = 100, rate = 0.2156789012345, currency = 'JPY') {
    const calc = computeSplits(
      'equal',
      ids.map((id) => ({ id: id.toString(), selected: true, value: '' })),
      original,
      rate
    );
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          currency,
          exchangeRate: rate,
          originalAmount: original,
          amount: calc.allocatedTWD,
          splits: ids.map((id) => ({ user: id, shareAmount: calc.twd[id.toString()] })),
        },
      }
    );
    return calc;
  }
  function equalBody(revision: string, original: number, rate: number, currency = 'JPY') {
    const calc = computeSplits(
      'equal',
      ids.map((id) => ({ id: id.toString(), selected: true, value: '' })),
      original,
      rate
    );
    return {
      base_currency: 'TWD',
      client_request_id: randomUUID(),
      expected_revision: revision,
      mode: 'equal',
      changes: {
        original_amount: original,
        currency,
        exchange_rate: rate,
        payer_id: peer.toString(),
        splits: ids.map((id) => ({
          user_id: id.toString(),
          share_amount: calc.twd[id.toString()],
        })),
      },
    };
  }
  it.each([
    [100.01, 0.2156789012345, 'JPY'],
    [0.01, 1e-12, 'JPY'],
    [50000000000, 0.02, 'JPY'],
    [0.01, 1e11, 'USD'],
    [123.45, 1, 'TWD'],
  ])(
    'foreign equal edit preserves exact source, Web shares, metadata and one receipt: %s/%s/%s',
    async (original, rate, currency) => {
      await seedEqual();
      const context = await read();
      // v2 allows equal recalculation in any original currency, not only TWD.
      expect(context.capabilities).toMatchObject({ equal: true, recalculate: true });
      const before = await db.collection('expenses').findOne({ _id: expense });
      const body = equalBody(
        context.revision,
        original as number,
        rate as number,
        currency as string
      );
      const results = await Promise.all(Array.from({ length: 4 }, () => write(body)));
      expect(results.every((r) => r.revision === results[0].revision)).toBe(true);
      const after = await db.collection('expenses').findOne({ _id: expense });
      expect(after).toMatchObject({
        originalAmount: original,
        exchangeRate: rate,
        currency,
        amount:
          body.changes.splits.reduce((sum, s) => sum + Math.round(s.share_amount * 100), 0) / 100,
      });
      expect(after!.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual(
        body.changes.splits.map((s) => s.share_amount)
      );
      for (const field of ['attachments', 'tags', 'itineraryDays', 'createdBy', 'createdAt'])
        expect(after![field]).toEqual(before![field]);
      expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(1);
      expect(await db.collection('activitylogs').countDocuments({})).toBe(1);
      await db.collection('trips').updateOne(
        { _id: trip },
        {
          $set: {
            currencySettings: { defaultCurrency: 'EUR', currencies: [{ code: 'JPY', rate: 9 }] },
          },
        }
      );
      expect(await write(body)).toEqual(results[0]);
      await expect(
        write({
          ...body,
          changes: { ...body.changes, currency: 'JPY', exchange_rate: Number(rate) * 2 },
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    }
  );
  it('TWD and foreign non-equal data cannot silently become equal; metadata remains editable', async () => {
    for (const currency of ['TWD', 'JPY']) {
      await db.collection('expenses').updateOne(
        { _id: expense },
        {
          $set: {
            currency,
            exchangeRate: currency === 'TWD' ? 1 : 0.25,
            originalAmount: currency === 'TWD' ? 100 : 400,
          },
        }
      );
      const context = await read();
      expect(context.capabilities.recalculate).toBe(false);
      await expect(write(equalBody(context.revision, 100, 0.25))).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await write(await update({ description: currency }));
    }
  });
  it.each(['currency', 'exchangeRate', 'splits'])(
    'Web changing %s rejects old foreign confirmation',
    async (field) => {
      await seedEqual();
      const body = equalBody((await read()).revision, 200, 0.25);
      const value =
        field === 'currency'
          ? 'USD'
          : field === 'exchangeRate'
            ? 30
            : [{ user: actor, shareAmount: 21.57 }];
      await db.collection('expenses').updateOne({ _id: expense }, { $set: { [field]: value } });
      await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
      expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
        status: 'rejected',
        code: 'RESOURCE_CHANGED',
      });
    }
  );
  it.each([
    { original_amount: 50000000000, exchange_rate: 0.021 },
    { original_amount: 100, exchange_rate: 1e308 },
    { currency: 'ZZZ' },
    { splits: [{ user_id: actor.toString(), share_amount: 99 }] },
  ])(
    'invalid foreign recalculation leaves expense unchanged and saves terminal refusal: %j',
    async (patch) => {
      await seedEqual();
      const body = equalBody((await read()).revision, 100, 0.25);
      const before = await db.collection('expenses').findOne({ _id: expense });
      await expect(
        write({ ...body, changes: { ...body.changes, ...patch } })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(await db.collection('expenses').findOne({ _id: expense })).toEqual(before);
      expect(await db.collection('activitylogs').countDocuments({})).toBe(0);
    }
  );
  it('foreign receipt insert failure rolls back expense and activity', async () => {
    await seedEqual();
    const body = equalBody((await read()).revision, 200, 0.25);
    const before = await db.collection('expenses').findOne({ _id: expense });
    const insert = mongo.Collection.prototype.insertOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
      this: mongo.Collection,
      doc,
      options
    ) {
      if (this.collectionName === MUTATION_REQUESTS) throw new Error('receipt disk failure');
      return insert.call(this, doc, options);
    });
    try {
      await expect(write(body)).rejects.toThrow('receipt disk failure');
    } finally {
      spy.mockRestore();
    }
    expect(await db.collection('expenses').findOne({ _id: expense })).toEqual(before);
    expect(await db.collection('activitylogs').countDocuments({})).toBe(0);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(0);
  });
  describe('G3 explicit reallocation', () => {
    const advanced = async (mode: 'equal' | 'amount' | 'percent' | 'shares' = 'shares') => ({
      ...(await update()),
      mode: 'split',
      changes: {
        original_amount: 100,
        currency: 'TWD',
        exchange_rate: 1,
        payer_id: actor.toString(),
        split:
          mode === 'equal'
            ? { mode }
            : {
                mode,
                values:
                  mode === 'shares'
                    ? [1, 2, 3]
                    : mode === 'amount'
                      ? [20, null, null]
                      : [33.33, 33.33, 33.33],
              },
        splits: ids.map((id, i) => ({
          user_id: id.toString(),
          share_amount: (mode === 'shares'
            ? [16.67, 33.33, 50]
            : mode === 'amount'
              ? [20, 40, 40]
              : [33.34, 33.33, 33.33])[i],
        })),
      },
    });
    it.each(['equal', 'amount', 'percent', 'shares'] as const)(
      'explicitly replaces historical non-equal shares with %s and keeps unrelated fields',
      async (mode) => {
        const before = await db.collection('expenses').findOne({ _id: expense });
        const context = await read();
        expect(context.capabilities.recalculate).toBe(false);
        expect(context.capabilities.splitModes).toEqual(['equal', 'amount', 'percent', 'shares']);
        const body = await advanced(mode);
        const results = await Promise.all([write(body), write(body)]);
        expect(results[0]).toEqual(results[1]);
        const after = await db.collection('expenses').findOne({ _id: expense });
        for (const field of [
          'attachments',
          'tags',
          'itineraryDays',
          'createdBy',
          'createdAt',
          'expenseDelivery',
        ])
          expect(after![field]).toEqual(before![field]);
        expect(after!.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual(
          body.changes.splits.map((s) => s.share_amount)
        );
        expect(after!.split).toBeUndefined();
        expect(after!.splitMode).toBeUndefined();
        expect(await db.collection('activitylogs').countDocuments({})).toBe(1);
        expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
          status: 'committed',
          result: results[0],
        });
        await db
          .collection('trips')
          .updateOne({ _id: trip }, { $pull: { members: { user: peer } } } as never);
        expect(await write(body)).toEqual(results[0]);
        await expect(
          write({
            ...body,
            changes: { ...body.changes, split: { mode: 'shares', values: [2, 2, 2] } },
          })
        ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      }
    );
    it.each(['members', 'splits', 'description', 'attachments'])(
      'rejects stale confirmation after concurrent %s changes',
      async (field) => {
        const body = await advanced();
        if (field === 'members')
          await db
            .collection('trips')
            .updateOne({ _id: trip }, { $pull: { members: { user: peer } } } as never);
        else
          await db
            .collection('expenses')
            .updateOne(
              { _id: expense },
              { $set: { [field]: field === 'description' ? 'Web edited' : [] } }
            );
        const before = await db.collection('expenses').findOne({ _id: expense });
        await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
        expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
          status: 'rejected',
          code: 'RESOURCE_CHANGED',
        });
        expect(await db.collection('expenses').findOne({ _id: expense })).toEqual(before);
      }
    );
    it.each([
      ['USD', 'JPY', 100, 0.0067, [0, 0.22, 0.45]],
      ['TWD', 'KRW', 0.01, 1e-7, [0, 0, 0]],
      ['TWD', 'USD', 0.01, 1e11, [0, 0, 1_000_000_000]],
    ] as const)(
      'reallocates a %s ledger in %s with exact converted confirmation',
      async (base, currency, amount, rate, shares) => {
        await db.collection('trips').updateOne({ _id: trip }, { $set: { baseCurrency: base } });
        await db
          .collection('expenses')
          .updateOne({ _id: expense }, { $set: { baseCurrency: base, currency: base } });
        const body = await advanced();
        await write({
          ...body,
          base_currency: base,
          changes: {
            ...body.changes,
            original_amount: amount,
            currency,
            exchange_rate: rate,
            split: { mode: 'shares', values: [0, 1, 2] },
            splits: ids.map((id, i) => ({ user_id: id.toString(), share_amount: shares[i] })),
          },
        });
        const after = await db.collection('expenses').findOne({ _id: expense });
        expect(after!.originalAmount).toBe(amount);
        expect(after!.exchangeRate).toBe(rate);
        expect(after!.splits.map((s: { shareAmount: number }) => s.shareAmount)).toEqual(shares);
      }
    );
    it('rechecks authorization before exposing an earlier advanced receipt', async () => {
      const body = await advanced();
      await write(body);
      await db
        .collection('trips')
        .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as never);
      await expect(write(body)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('requires reselecting removed historical members but can replace their old allocation', async () => {
      await db
        .collection('trips')
        .updateOne({ _id: trip }, { $pull: { members: { user: peer } } } as never);
      const body = await advanced();
      await expect(write(body)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const next = {
        ...body,
        client_request_id: randomUUID(),
        changes: {
          ...body.changes,
          split: { mode: 'amount', values: [100] },
          splits: [{ user_id: actor.toString(), share_amount: 100 }],
        },
      };
      await write(next);
      expect((await read()).expense.splits).toHaveLength(1);
    });
    it('persists a terminal refusal for a balanced one-cent mismatch', async () => {
      const body = await advanced();
      body.changes.splits[0].share_amount = 16.68;
      body.changes.splits[1].share_amount = 33.32;
      const before = await db.collection('expenses').findOne({ _id: expense });
      await expect(write(body)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(write(body)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(await db.collection('expenses').findOne({ _id: expense })).toEqual(before);
      expect(await db.collection('activitylogs').countDocuments({})).toBe(0);
    });
    it('rolls back advanced edit and activity if the receipt cannot be committed', async () => {
      const body = await advanced();
      const before = await db.collection('expenses').findOne({ _id: expense });
      const insert = mongo.Collection.prototype.insertOne;
      const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
        this: mongo.Collection,
        doc,
        options
      ) {
        if (this.collectionName === MUTATION_REQUESTS) throw new Error('G3 receipt unavailable');
        return insert.call(this, doc, options);
      });
      try {
        await expect(write(body)).rejects.toThrow('G3 receipt unavailable');
      } finally {
        spy.mockRestore();
      }
      expect(await db.collection('expenses').findOne({ _id: expense })).toEqual(before);
      expect(await db.collection('activitylogs').countDocuments({})).toBe(0);
      expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toEqual({
        status: 'not_found',
      });
      await write(body);
    });
  });
});
