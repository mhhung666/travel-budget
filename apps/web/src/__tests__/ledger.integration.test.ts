// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLedgerV2, validateLedgerChildren } from '@/lib/ledger';
import { enterTrip, readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
import { readPaymentContext, readPaymentRevokeContext, writePayment } from '@/lib/paymentWrite';
import { readExpenseEditContext, maintainExpense } from '@/lib/expenseMaintenance';
import { setBudgetForActor } from '@/lib/budgetWrite';
import { manageTrip, readTripCurrency } from '@/lib/tripManagement';
import { readTripAccess, manageTripAccess } from '@/lib/tripAccess';
import { withTripWriteInDatabase } from '@/lib/tripWriteTransaction';

const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('B1 isolated ledger transactions', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    third = new mongo.ObjectId();
  const trip = new mongo.ObjectId(),
    expense = new mongo.ObjectId();
  const ids = [actor, peer, third].map((id) => id.toHexString());
  const secret = 'b1-owned-test-secret';
  const collections = [
    'trips',
    'users',
    'expenses',
    'payments',
    MUTATION_REQUESTS,
    'activitylogs',
    'notifications',
  ];
  const paymentContext = () => readPaymentContext(db, ids[0], trip.toString(), secret);
  const createTrip = (base_currency: string, client_request_id = randomUUID()) =>
    enterTrip(db, ids[0], 'trip.create', { client_request_id, name: 'New base', base_currency });
  beforeAll(async () => {
    client = await new mongo.MongoClient(uri!).connect();
    db = client.db(`tb_b1_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    for (const name of collections) await db.createCollection(name);
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });
  beforeEach(async () => {
    vi.unstubAllEnvs();
    for (const name of collections) await db.collection(name).deleteMany({});
    await db.collection('users').insertMany(
      ids.map((id) => ({
        _id: new mongo.ObjectId(id),
        displayName: id,
        username: id,
        isVirtual: false,
      }))
    );
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'USD fixture',
      hashCode: 'b1usdxxx',
      baseCurrency: 'USD',
      members: [actor, peer, third].map((user, i) => ({
        user,
        role: i === 0 ? 'admin' : 'member',
        joinedAt: new Date('2026-01-01'),
      })),
    });
    await db.collection('expenses').insertOne({
      _id: expense,
      trip,
      baseCurrency: 'USD',
      payer: actor,
      amount: 20.1,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0067,
      description: 'Dinner',
      category: 'food',
      date: new Date('2026-10-08'),
      splits: [actor, peer, third].map((user) => ({ user, shareAmount: 6.7 })),
    });
  });
  it('keeps a gate rejection terminal after enabling creation and on replay', async () => {
    const uuid = randomUUID();
    vi.stubEnv('ENABLE_NON_TWD_LEDGER', 'false');
    await expect(withLedgerV2(() => createTrip('USD', uuid))).rejects.toThrow(
      'FEATURE_NOT_AVAILABLE'
    );
    vi.stubEnv('ENABLE_NON_TWD_LEDGER', 'true');
    await expect(withLedgerV2(() => createTrip('USD', uuid))).rejects.toThrow(
      'FEATURE_NOT_AVAILABLE'
    );
    const receipt = await withLedgerV2(() => readTripMutation(db, ids[0], uuid));
    expect(receipt).toMatchObject({
      status: 'rejected',
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
    });
    expect(await db.collection('trips').countDocuments({})).toBe(1);
    await expect(readTripMutation(db, ids[0], uuid)).rejects.toThrow('CLIENT_UPGRADE_REQUIRED');
  });
  it.each(['USD', 'JPY', 'TWD'])(
    'creates %s once under concurrent identical UUIDs',
    async (base) => {
      vi.stubEnv('ENABLE_NON_TWD_LEDGER', 'true');
      const uuid = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 3 }, () => withLedgerV2(() => createTrip(base, uuid)))
      );
      expect(new Set(results.map((r) => r.tripId)).size).toBe(1);
      expect(
        await db.collection('trips').countDocuments({ name: 'New base', baseCurrency: base })
      ).toBe(1);
      const created = await db
        .collection('trips')
        .findOne({ _id: new mongo.ObjectId(results[0].tripId) });
      expect(created!.members[0]).toMatchObject({ user: actor, role: 'admin' });
      await expect(
        withLedgerV2(() => createTrip(base === 'USD' ? 'JPY' : 'USD', uuid))
      ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    }
  );
  it('rejects v1 joining USD without changing members or writing a receipt', async () => {
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: third } } } as mongo.Document);
    const body = { client_request_id: randomUUID(), invite_code: 'b1usdxxx' };
    await expect(enterTrip(db, ids[2], 'trip.join', body)).rejects.toThrow(
      'CLIENT_UPGRADE_REQUIRED'
    );
    expect(await db.collection('trips').countDocuments({ _id: trip, 'members.user': third })).toBe(
      0
    );
    expect(await db.collection(MUTATION_REQUESTS).countDocuments({})).toBe(0);
    await withLedgerV2(() => enterTrip(db, ids[2], 'trip.join', body));
    await withLedgerV2(() => enterTrip(db, ids[2], 'trip.join', body));
    expect(
      (await db.collection('trips').findOne({ _id: trip }))!.members.filter(
        (m: { user: mongo.ObjectId }) => m.user.equals(third)
      )
    ).toHaveLength(1);
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: third } } } as mongo.Document);
    await expect(
      withLedgerV2(() => readTripMutation(db, ids[2], body.client_request_id))
    ).rejects.toThrow('NOT_FOUND');
  });
  it('records and revokes a partial USD payment exactly once', async () =>
    withLedgerV2(async () => {
      const before = await paymentContext();
      expect(before.settlement.balances.map((b) => b.balance)).toEqual([13.4, -6.7, -6.7]);
      const body = {
        base_currency: 'USD',
        client_request_id: randomUUID(),
        expected_revision: before.settlementRevision,
        from_id: ids[1],
        to_id: ids[0],
        amount: 3.35,
        note: '',
      };
      const writes = await Promise.all(
        Array.from({ length: 3 }, () =>
          writePayment(db, ids[0], trip.toString(), 'payment.create', body, secret)
        )
      );
      expect(new Set(writes.map((w) => w.result.paymentId)).size).toBe(1);
      expect(await db.collection('payments').countDocuments({ trip, baseCurrency: 'USD' })).toBe(1);
      expect((await paymentContext()).settlement.balances.map((b) => b.balance)).toEqual([
        10.05, -3.35, -6.7,
      ]);
      const id = writes[0].result.paymentId;
      const revoke = {
        base_currency: 'USD',
        client_request_id: randomUUID(),
        expected_revision: (await readPaymentRevokeContext(db, ids[0], trip.toString(), id, secret))
          .revision,
      };
      await writePayment(db, ids[0], trip.toString(), 'payment.delete', revoke, secret, id);
      await writePayment(db, ids[0], trip.toString(), 'payment.delete', revoke, secret, id);
      expect(await db.collection('payments').countDocuments({ trip })).toBe(0);
      expect((await paymentContext()).settlement.balances).toEqual(before.settlement.balances);
    }));
  it('persists a wrong-unit rejection without touching the payment or expense', async () =>
    withLedgerV2(async () => {
      const body = {
        base_currency: 'TWD',
        client_request_id: randomUUID(),
        expected_revision: (await paymentContext()).settlementRevision,
        from_id: ids[1],
        to_id: ids[0],
        amount: 3.35,
        note: '',
      };
      await expect(
        writePayment(db, ids[0], trip.toString(), 'payment.create', body, secret)
      ).rejects.toThrow('LEDGER_CURRENCY_MISMATCH');
      expect(await readTripMutation(db, ids[0], body.client_request_id)).toMatchObject({
        status: 'rejected',
        code: 'LEDGER_CURRENCY_MISMATCH',
        ledger: { baseCurrency: 'USD' },
      });
      expect(await db.collection('payments').countDocuments({})).toBe(0);
      const edit = await readExpenseEditContext(
        db,
        ids[0],
        trip.toString(),
        expense.toString(),
        secret
      );
      const update = {
        base_currency: 'TWD',
        client_request_id: randomUUID(),
        expected_revision: edit.revision,
        mode: 'basic' as const,
        changes: { description: 'Wrong unit' },
      };
      await expect(
        maintainExpense(
          db,
          ids[0],
          trip.toString(),
          expense.toString(),
          'expense.update',
          update,
          secret
        )
      ).rejects.toThrow('LEDGER_CURRENCY_MISMATCH');
      expect((await db.collection('expenses').findOne({ _id: expense }))!.description).toBe(
        'Dinner'
      );
    }));
  it('keeps original foreign fields on basic editing and accepts TWD as USD foreign money', async () =>
    withLedgerV2(async () => {
      const context = () =>
        readExpenseEditContext(db, ids[0], trip.toString(), expense.toString(), secret);
      await maintainExpense(
        db,
        ids[0],
        trip.toString(),
        expense.toString(),
        'expense.update',
        {
          base_currency: 'USD',
          client_request_id: randomUUID(),
          expected_revision: (await context()).revision,
          mode: 'basic',
          changes: { description: 'Edited' },
        },
        secret
      );
      expect(await db.collection('expenses').findOne({ _id: expense })).toMatchObject({
        originalAmount: 3000,
        exchangeRate: 0.0067,
        currency: 'JPY',
        amount: 20.1,
        baseCurrency: 'USD',
      });
      await maintainExpense(
        db,
        ids[0],
        trip.toString(),
        expense.toString(),
        'expense.update',
        {
          base_currency: 'USD',
          client_request_id: randomUUID(),
          expected_revision: (await context()).revision,
          mode: 'equal',
          changes: {
            original_amount: 100,
            currency: 'TWD',
            exchange_rate: 0.03,
            payer_id: ids[0],
            splits: ids.map((user_id) => ({ user_id, share_amount: 1 })),
          },
        },
        secret
      );
      expect(await db.collection('expenses').findOne({ _id: expense })).toMatchObject({
        originalAmount: 100,
        exchangeRate: 0.03,
        currency: 'TWD',
        amount: 3,
        baseCurrency: 'USD',
      });
    }));
  it('stamps only the actor budget and rejects missing/wrong units, unsafe cents and outsiders', async () => {
    await withLedgerV2(() =>
      setBudgetForActor(db, ids[1], trip.toString(), {
        base_currency: 'USD',
        total: 10,
        categories: [{ category: 'food', amount: 7 }],
      })
    );
    const parent = await db.collection('trips').findOne({ _id: trip });
    expect(parent!.members[1].budget).toEqual({
      baseCurrency: 'USD',
      total: 10,
      categories: [{ category: 'food', amount: 7 }],
    });
    expect(parent!.members[0].budget).toBeUndefined();
    for (const body of [
      { total: 2 },
      { base_currency: 'USD', total: 0.001 },
      { base_currency: 'USD', total: 1000000000.01 },
    ])
      await expect(
        withLedgerV2(() => setBudgetForActor(db, ids[1], trip.toString(), body))
      ).rejects.toThrow('VALIDATION_ERROR');
    await expect(
      withLedgerV2(() =>
        setBudgetForActor(db, ids[1], trip.toString(), { base_currency: 'TWD', total: 2 })
      )
    ).rejects.toThrow('LEDGER_CURRENCY_MISMATCH');
    await expect(
      withLedgerV2(() =>
        setBudgetForActor(db, new mongo.ObjectId().toString(), trip.toString(), {
          base_currency: 'USD',
          total: 2,
        })
      )
    ).rejects.toThrow('FORBIDDEN');
  });
  it('keeps base fixed while currency defaults change and refuses a base update', async () =>
    withLedgerV2(async () => {
      const context = await readTripCurrency(db, ids[0], trip.toString(), secret);
      await manageTrip(
        db,
        ids[0],
        trip.toString(),
        'trip.currency',
        {
          base_currency: 'USD',
          client_request_id: randomUUID(),
          expected_revision: context.revision,
          settings: {
            default_currency: 'JPY',
            currencies: [
              { code: 'USD', rate: 9 },
              { code: 'TWD', rate: 0.03 },
            ],
          },
        },
        secret
      );
      expect(await db.collection('trips').findOne({ _id: trip })).toMatchObject({
        baseCurrency: 'USD',
        currencySettings: {
          defaultCurrency: 'JPY',
          currencies: [
            { code: 'USD', rate: null },
            { code: 'TWD', rate: 0.03 },
          ],
        },
      });
      await expect(
        manageTrip(
          db,
          ids[0],
          trip.toString(),
          'trip.update',
          {
            client_request_id: randomUUID(),
            expected_revision: context.revision,
            changes: { base_currency: 'JPY' },
          },
          secret
        )
      ).rejects.toThrow();
      expect((await db.collection('trips').findOne({ _id: trip }))!.baseCurrency).toBe('USD');
    }));
  it.each([undefined, 'TWD'])(
    'refuses a USD child with unit %s and rolls back the parent fence',
    async (unit) => {
      await db
        .collection('expenses')
        .updateOne(
          { _id: expense },
          unit ? { $set: { baseCurrency: unit } } : { $unset: { baseCurrency: '' } }
        );
      await expect(withLedgerV2(() => paymentContext())).rejects.toThrow('LEDGER_DATA_INVALID');
      expect(
        (await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence
      ).toBeUndefined();
    }
  );
  it('rolls back a failed write and retains the original legacy TWD receipt shape', async () => {
    await db.collection('trips').updateOne({ _id: trip }, { $unset: { baseCurrency: '' } });
    await db.collection('expenses').updateOne({ _id: expense }, { $unset: { baseCurrency: '' } });
    await expect(
      withTripWriteInDatabase(db, trip.toString(), ids[0], async (session) => {
        await db.collection('payments').insertOne({ trip, amount: 2 }, { session });
        throw new Error('abort');
      })
    ).rejects.toThrow('abort');
    expect(await db.collection('payments').countDocuments({})).toBe(0);
    expect(
      (await db.collection('trips').findOne({ _id: trip }))!.expenseDeliveryFence
    ).toBeUndefined();
    const uuid = randomUUID();
    const result = await enterTrip(db, ids[0], 'trip.create', {
      client_request_id: uuid,
      name: 'Legacy',
    });
    const receipt = await readTripMutation(db, ids[0], uuid);
    expect(receipt).toEqual({
      status: 'committed',
      operation: 'trip.create',
      resourceId: result.tripId,
      result: { tripId: result.tripId },
    });
    expect(
      (await db
        .collection<{ _id: string; contractVersion?: number }>(MUTATION_REQUESTS)
        .findOne({ _id: `${ids[0]}:${uuid}` }))!.contractVersion
    ).toBeUndefined();
    await expect(withLedgerV2(() => createTrip('TWD', uuid))).rejects.toThrow(
      'CLIENT_UPGRADE_REQUIRED'
    );
    await validateLedgerChildren(db, (await db.collection('trips').findOne({ _id: trip }))!);
  });
  it('replays a successful v2 leave after membership has gone, without a second write', async () => {
    const body = await withLedgerV2(async () => ({
      client_request_id: randomUUID(),
      action: 'leave' as const,
      expected_revision: (await readTripAccess(db, ids[1], trip.toString(), secret)).accessRevision,
    }));
    const first = await withLedgerV2(() =>
      manageTripAccess(db, ids[1], trip.toString(), body, secret)
    );
    expect(
      await withLedgerV2(() => manageTripAccess(db, ids[1], trip.toString(), body, secret))
    ).toEqual(first);
    expect(
      await withLedgerV2(() => readTripMutation(db, ids[1], body.client_request_id))
    ).toMatchObject({
      status: 'committed',
      ledger: { baseCurrency: 'USD' },
      result: { exited: true, ledger: { baseCurrency: 'USD' } },
    });
  });
  it('keeps JPY fractional cents on both expense shares and the minimum repayment', async () => {
    await db.collection('trips').updateOne({ _id: trip }, { $set: { baseCurrency: 'JPY' } });
    await db.collection('expenses').updateOne(
      { _id: expense },
      {
        $set: {
          baseCurrency: 'JPY',
          originalAmount: 100.01,
          amount: 100.01,
          exchangeRate: 1,
          splits: [actor, peer, third].map((user, i) => ({
            user,
            shareAmount: [33.34, 33.34, 33.33][i],
          })),
        },
      }
    );
    await withLedgerV2(async () => {
      const state = await paymentContext();
      expect(state.settlement.balances.map((b) => b.balance)).toEqual([66.67, -33.34, -33.33]);
      const body = {
        base_currency: 'JPY',
        client_request_id: randomUUID(),
        expected_revision: state.settlementRevision,
        from_id: ids[1],
        to_id: ids[0],
        amount: 0.01,
        note: '',
      };
      await writePayment(db, ids[0], trip.toString(), 'payment.create', body, secret);
      expect(await db.collection('payments').findOne({ trip })).toMatchObject({
        baseCurrency: 'JPY',
        amount: 0.01,
      });
      expect((await paymentContext()).settlement.balances.map((b) => b.balance)).toEqual([
        66.66, -33.33, -33.33,
      ]);
      await expect(
        writePayment(
          db,
          ids[0],
          trip.toString(),
          'payment.create',
          { ...body, client_request_id: randomUUID(), amount: 0.001 },
          secret
        )
      ).rejects.toThrow();
    });
  });
});
