// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentCreateInput, paymentDeleteInput } from '@travel-budget/contracts';
import {
  readPaymentContext,
  readPaymentRevokeContext,
  writePayment,
  paymentRevision,
  recordPaymentForActor,
  deletePaymentForActor,
} from '@/lib/paymentWrite';
import { readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('E4 isolated payment transactions', () => {
  let client: mongo.MongoClient;
  let db: mongo.Db;
  let owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    virtual = new mongo.ObjectId(),
    trip = new mongo.ObjectId(),
    expense = new mongo.ObjectId();
  const secret = 'e4-isolated-test-key';
  const collections = [
    'users',
    'trips',
    'expenses',
    'payments',
    'notifications',
    'activitylogs',
    MUTATION_REQUESTS,
  ];
  const context = () => readPaymentContext(db, actor.toString(), trip.toString(), secret);
  const createBody = async (amount = 50) =>
    paymentCreateInput.parse({
      client_request_id: randomUUID(),
      expected_revision: (await context()).settlementRevision,
      from_id: peer.toString(),
      to_id: actor.toString(),
      amount,
      note: ' paid ',
    });
  const create = (body: unknown, deliver = vi.fn(async () => undefined)) =>
    writePayment(
      db,
      actor.toString(),
      trip.toString(),
      'payment.create',
      paymentCreateInput.parse(body),
      secret,
      undefined,
      deliver
    );
  const revoke = async (id: string, body?: unknown) =>
    writePayment(
      db,
      actor.toString(),
      trip.toString(),
      'payment.delete',
      paymentDeleteInput.parse(
        body ?? {
          client_request_id: randomUUID(),
          expected_revision: (
            await readPaymentRevokeContext(db, actor.toString(), trip.toString(), id, secret)
          ).revision,
        }
      ),
      secret,
      id
    );
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_e4_${randomUUID().replaceAll('-', '')}`);
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
    for (const name of collections) await db.collection(name).deleteMany({});
    await db.collection('users').insertMany(
      [actor, peer, virtual].map((_id) => ({
        _id,
        displayName: 'Same name',
        isVirtual: _id.equals(virtual),
        username: 'private',
        email: 'private@example.test',
      }))
    );
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'E4',
      hashCode: 'e4testxx',
      members: [actor, peer, virtual].map((user) => ({
        user,
        role: 'member',
        joinedAt: new Date('2026-01-01'),
      })),
    });
    await db.collection('expenses').insertOne({
      _id: expense,
      trip,
      payer: actor,
      amount: 100,
      splits: [
        { user: actor, shareAmount: 50 },
        { user: peer, shareAmount: 50 },
      ],
      description: 'meal',
    });
  });
  it('context is private, id-based and calculated with existing settlement rules', async () => {
    const c = await context();
    expect(c.settlement.suggestedTransfers).toEqual([
      {
        fromId: peer.toString(),
        toId: actor.toString(),
        fromName: 'Same name',
        fromIsVirtual: false,
        toName: 'Same name',
        toIsVirtual: false,
        amount: 50,
      },
    ]);
    expect(c.members).toHaveLength(3);
    expect(c.members.map((m) => m.isVirtual)).toEqual([false, false, true]);
    expect(JSON.stringify(c)).not.toMatch(/private|email|hashCode|username/);
  });
  it.each([0.01, 20, 80, 1000000000])(
    'partial/excess payment %s uses backend settlement, no suggestion cap',
    async (amount) => {
      const body = await createBody(amount);
      const { result } = await create(body);
      expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
      const c = await context();
      expect(c.settlement.balances.find((b) => b.userId === peer.toString())?.balance).toBe(
        amount - 50
      );
      expect(c.settlement.status).toBe('outstanding');
      expect((await db.collection('payments').findOne({}))?.note).toBe('paid');
    }
  );
  it('manual payment with virtual parties and no suggestion is allowed without virtual notifications', async () => {
    const body = {
      ...(await createBody(12.34)),
      from_id: actor.toString(),
      to_id: virtual.toString(),
    };
    await create(body);
    expect(await db.collection('notifications').countDocuments()).toBe(0);
    expect((await context()).settlement.status).toBe('outstanding');
  });
  it.each(['mobile', 'web'])(
    '%s actor records a partial payment between two other real members',
    async (adapter) => {
      await db.collection('users').updateOne({ _id: virtual }, { $set: { isVirtual: false } });
      await db.collection('expenses').updateOne({ _id: expense }, { $set: { payer: virtual } });
      const body = { ...(await createBody(20)), to_id: virtual.toString() };
      const deliver = vi.fn(async () => undefined);
      if (adapter === 'mobile') {
        const first = await create(body, deliver);
        expect(await create(body, deliver)).toEqual(first);
        expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
          status: 'committed',
          operation: 'payment.create',
          resourceId: first.result.paymentId,
        });
      } else {
        await recordPaymentForActor(
          db,
          actor.toString(),
          trip.toString(),
          {
            from_id: body.from_id,
            to_id: body.to_id,
            amount: body.amount,
          },
          secret,
          deliver
        );
      }
      expect(await db.collection('payments').countDocuments()).toBe(1);
      const notifications = await db.collection('notifications').find().toArray();
      expect(notifications.map((n) => n.user.toString()).sort()).toEqual(
        [peer, virtual].map(String).sort()
      );
      const activities = await db.collection('activitylogs').find().toArray();
      expect(activities).toHaveLength(1);
      expect(new Set([...notifications, ...activities].map((n) => n._id.toString())).size).toBe(3);
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(
        (await context()).settlement.balances.find((b) => b.userId === peer.toString())?.balance
      ).toBe(-30);
    }
  );
  it('same UUID concurrent/replay writes once; failure after commit stays successful', async () => {
    const body = await createBody();
    const deliver = vi.fn(async () => {
      throw new Error('push unavailable');
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => create(body, deliver)));
    expect(new Set(results.map((r) => r.result.paymentId)).size).toBe(1);
    expect(await db.collection('payments').countDocuments()).toBe(1);
    expect(await db.collection('notifications').countDocuments()).toBe(1);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect((await context()).settlement.status).toBe('settled');
    await expect(create({ ...body, amount: 1 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
      status: 'committed',
      operation: 'payment.create',
      resourceId: results[0].result.paymentId,
    });
  });
  it('two different UUIDs with one settlement revision commit only once; reconfirming fresh state permits same amount', async () => {
    const body = await createBody();
    const second = { ...body, client_request_id: randomUUID() };
    const settled = await Promise.allSettled([create(body), create(second)]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(settled.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'SETTLEMENT_CHANGED' },
    });
    expect(await db.collection('payments').countDocuments()).toBe(1);
    await create(await createBody());
    expect(await db.collection('payments').countDocuments()).toBe(2);
  });
  it.each(['expense', 'expense-added', 'members', 'payment', 'note'])(
    '%s changes invalidate settlement even with equal net balance',
    async (kind) => {
      if (kind === 'note') await create(await createBody(0.01));
      const body = await createBody();
      if (kind === 'expense')
        await db
          .collection('expenses')
          .updateOne({ _id: expense }, { $set: { description: 'Web edited' } });
      if (kind === 'expense-added')
        await db.collection('expenses').insertOne({
          _id: new mongo.ObjectId(),
          trip,
          payer: actor,
          amount: 1,
          splits: [{ user: actor, shareAmount: 1 }],
        });
      if (kind === 'members')
        await db
          .collection('trips')
          .updateOne(
            { _id: trip },
            { $set: { members: [peer, actor, virtual].map((user) => ({ user, role: 'member' })) } }
          );
      if (kind === 'payment') await create(await createBody(0.01));
      if (kind === 'note')
        await db.collection('payments').updateOne({ trip }, { $set: { note: 'Web changed note' } });
      await expect(create(body)).rejects.toMatchObject({ code: 'SETTLEMENT_CHANGED' });
      expect(await readTripMutation(db, actor.toString(), body.client_request_id)).toMatchObject({
        status: 'rejected',
        tripId: trip.toString(),
        code: 'SETTLEMENT_CHANGED',
      });
      // Refused UUID never turns into a successful operation by replacing its old precondition.
      await expect(
        create({ ...body, expected_revision: (await context()).settlementRevision })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    }
  );
  it('delivery checkpoints and member display-name changes do not invalidate accounting state', async () => {
    const body = await createBody();
    await db
      .collection('expenses')
      .updateOne({ _id: expense }, { $set: { expenseDelivery: { state: 'sent' } } });
    await db.collection('users').updateOne({ _id: peer }, { $set: { displayName: 'Renamed' } });
    expect((await context()).settlementRevision).toBe(body.expected_revision);
    await create(body);
  });
  it('revocation is idempotent and creation replay cannot resurrect payment or repeat effects', async () => {
    const body = await createBody();
    const first = await create(body);
    const id = first.result.paymentId;
    const removal = {
      client_request_id: randomUUID(),
      expected_revision: (
        await readPaymentRevokeContext(db, actor.toString(), trip.toString(), id, secret)
      ).revision,
    };
    await Promise.all(Array.from({ length: 4 }, () => revoke(id, removal)));
    expect(await db.collection('payments').countDocuments()).toBe(0);
    expect(await create(body)).toEqual(first);
    expect(await db.collection('payments').countDocuments()).toBe(0);
    expect(await db.collection('activitylogs').countDocuments()).toBe(1);
    expect(await db.collection('notifications').countDocuments()).toBe(1);
    expect((await context()).settlement.suggestedTransfers[0].amount).toBe(50);
  });
  it.each(['from', 'to', 'amount', 'note'])(
    'raw %s change after revoke confirmation requires reconfirmation',
    async (field) => {
      const { result } = await create(await createBody());
      const c = await readPaymentRevokeContext(
        db,
        actor.toString(),
        trip.toString(),
        result.paymentId,
        secret
      );
      await db
        .collection('payments')
        .updateOne(
          { _id: new mongo.ObjectId(result.paymentId) },
          { $set: { [field]: field === 'amount' ? 20 : field === 'note' ? 'changed' : virtual } }
        );
      await expect(
        revoke(result.paymentId, { client_request_id: randomUUID(), expected_revision: c.revision })
      ).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
      expect(await db.collection('payments').countDocuments()).toBe(1);
    }
  );
  it('other-trip resource is gone; removed member cannot replay/lookup any receipt', async () => {
    const body = await createBody();
    const { result } = await create(body);
    await expect(
      readPaymentRevokeContext(
        db,
        actor.toString(),
        trip.toString(),
        new mongo.ObjectId().toString(),
        secret
      )
    ).rejects.toMatchObject({ code: 'RESOURCE_GONE' });
    await db
      .collection('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } } as mongo.Document);
    await expect(create(body)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readTripMutation(db, actor.toString(), body.client_request_id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      await db.collection('payments').countDocuments({ _id: new mongo.ObjectId(result.paymentId) })
    ).toBe(1);
  });
  it('receipt storage failure rolls back payment, notification and activity', async () => {
    const body = await createBody();
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
      writePayment(broken, actor.toString(), trip.toString(), 'payment.create', body, secret)
    ).rejects.toThrow('disk full');
    for (const name of ['payments', 'notifications', 'activitylogs', MUTATION_REQUESTS])
      expect(await db.collection(name).countDocuments()).toBe(0);
  });
  it('Web actor adapters use same rules and tolerate delivery failure after commit', async () => {
    const fields = { from_id: peer.toString(), to_id: actor.toString(), amount: 10.01 };
    const saved = await recordPaymentForActor(
      db,
      actor.toString(),
      trip.toString(),
      fields,
      secret,
      async () => {
        throw new Error('mail unavailable');
      }
    );
    expect((await context()).settlement.payments[0].id).toBe(saved.id);
    await deletePaymentForActor(db, actor.toString(), trip.toString(), saved.id, secret);
    expect((await context()).settlement.payments).toHaveLength(0);
    const raw = { _id: new mongo.ObjectId(), from: peer, to: actor, amount: 10, note: '' };
    expect(paymentRevision(secret, trip.toString(), raw)).not.toBe(
      paymentRevision(secret, new mongo.ObjectId().toString(), raw)
    );
  });
});
