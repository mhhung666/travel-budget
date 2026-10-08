// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manageTripAccess, readTripAccess, changeRoleForActor } from '@/lib/tripAccess';
import { readTripMutation, MUTATION_REQUESTS } from '@/lib/tripEntry';
import { removeTripMember } from '@/lib/memberRemoval';
import { TRIP_CHILD_COLLECTIONS } from '@/lib/tripDeletion';
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('G1c isolated access transactions', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    virtual = new mongo.ObjectId(),
    trip = new mongo.ObjectId();
  const secret = 'g1c-isolated-secret';
  const context = (id = actor) => readTripAccess(db, String(id), String(trip), secret);
  const input = async (action: 'leave' | 'delete', id = actor) => ({
    action,
    client_request_id: randomUUID(),
    expected_revision: (await context(id)).accessRevision,
  });
  const write = (body: Parameters<typeof manageTripAccess>[3], id = actor) =>
    manageTripAccess(db, String(id), String(trip), body, secret);
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_g1c_${randomUUID().replaceAll('-', '')}`);
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
    for (const c of await db.listCollections().toArray())
      if (c.name !== 'verification_owner') await db.collection(c.name).deleteMany({});
    await db.collection('users').insertMany([
      { _id: actor, displayName: 'Admin', password: 'private', email: 'private', isVirtual: false },
      { _id: peer, displayName: 'Peer', isVirtual: false },
      { _id: virtual, displayName: 'Virtual', isVirtual: true },
    ]);
    await db.collection('trips').insertOne({
      _id: trip,
      name: 'Trip',
      hashCode: 'private-link',
      members: [
        { user: actor, role: 'admin', budget: 999 },
        { user: peer, role: 'member' },
        { user: virtual, role: 'member' },
      ],
    });
    await db.collection('expenses').insertOne({
      trip,
      payer: peer,
      amount: 12.34,
      splits: [{ user: peer, shareAmount: 12.34 }],
      author: peer,
    });
    await db.collection('payments').insertOne({ trip, from: peer, to: virtual, amount: 1.23 });
    await db
      .collection('checklists')
      .insertOne({ trip, items: [{ assignee: peer, doneBy: [peer, actor] }] });
    await db.collection('notifications').insertOne({ trip, user: peer });
  });
  it('whitelists the context and keeps a stable revision across fenced reads', async () => {
    const a = await context();
    expect(await context()).toEqual(a);
    expect(a).toMatchObject({ expenseCount: 1, paymentCount: 1, canLeave: false });
    expect(JSON.stringify(a)).not.toMatch(/password|email|budget|hashCode|private/);
    expect((await context(peer)).canLeave).toBe(true);
  });
  it.each(['role', 'remove', 'delete'] as const)(
    'member cannot %s and rejection is terminal',
    async (action) => {
      const body = {
        ...(await input('delete', peer)),
        action,
        ...(action !== 'delete' ? { member_id: String(virtual) } : {}),
        ...(action === 'role' ? { role: 'admin' as const } : {}),
      } as Parameters<typeof manageTripAccess>[3];
      await expect(write(body, peer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await readTripMutation(db, String(peer), body.client_request_id)).toMatchObject({
        status: 'rejected',
        code: 'FORBIDDEN',
      });
    }
  );
  it('role changes are shared with Web, forbid self changes and preserve budgets', async () => {
    const body = {
      ...(await input('delete')),
      action: 'role' as const,
      member_id: String(peer),
      role: 'admin' as const,
    };
    await write(body);
    expect((await context()).canLeave).toBe(true);
    expect((await db.collection('trips').findOne({ _id: trip }))!.members[0].budget).toBe(999);
    await expect(
      write({ ...body, client_request_id: randomUUID(), member_id: String(actor) })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      changeRoleForActor(db, String(trip), String(actor), String(actor).toUpperCase(), 'member')
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      removeTripMember(db, {
        tripId: String(trip),
        actorId: String(actor),
        targetId: String(actor).toUpperCase(),
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const old = await input('delete');
    await changeRoleForActor(db, String(trip), String(actor), String(peer), 'member');
    await expect(write(old)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
  });
  it('remove keeps all financial references and shared identity, cleans only member collaboration', async () => {
    const expense = await db.collection('expenses').findOne({ trip }),
      payment = await db.collection('payments').findOne({ trip });
    const body = { ...(await input('delete')), action: 'remove' as const, member_id: String(peer) };
    const results = await Promise.all([write(body), write(body)]);
    expect(results[0]).toEqual(results[1]);
    expect(await db.collection('expenses').findOne({ trip })).toEqual(expense);
    expect(await db.collection('payments').findOne({ trip })).toEqual(payment);
    expect(await db.collection('users').countDocuments({ _id: peer })).toBe(1);
    expect((await db.collection('checklists').findOne({ trip }))!.items).toEqual([
      { assignee: null, doneBy: [actor] },
    ]);
    expect(await db.collection('notifications').countDocuments({ trip, user: peer })).toBe(0);
    await expect(context(peer)).rejects.toThrow();
    await expect(write({ ...body, client_request_id: randomUUID() })).rejects.toMatchObject({
      code: 'RESOURCE_GONE',
    });
  });
  it('last usable administrator cannot leave, even if a virtual member is an administrator', async () => {
    await changeRoleForActor(db, String(trip), String(actor), String(virtual), 'admin');
    expect((await context()).canLeave).toBe(false);
    const body = await input('leave');
    await expect(write(body)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await readTripMutation(db, String(actor), body.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION_ERROR',
    });
  });
  it('simultaneous administrator exits preserve one usable admin', async () => {
    await changeRoleForActor(db, String(trip), String(actor), String(peer), 'admin');
    const a = await input('leave'),
      b = await input('leave', peer);
    const results = await Promise.allSettled([write(a), write(b, peer)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.collection('trips').findOne({ _id: trip }))!.members.filter(
        (m: { role: string }) => m.role === 'admin'
      )
    ).toHaveLength(1);
  });
  it.each(['leave', 'delete'] as const)(
    '%s repeats the original minimal result after lost response, without exposing other receipts',
    async (action) => {
      const who = action === 'leave' ? peer : actor;
      const old = {
        ...(await input('delete', who)),
        action: 'role' as const,
        member_id: String(virtual),
        role: 'admin' as const,
      };
      if (who === actor) await write(old, who);
      else await expect(write(old, who)).rejects.toThrow();
      const body = await input(action, who);
      const results = await Promise.all([write(body, who), write(body, who), write(body, who)]);
      expect(results).toEqual(Array(3).fill({ tripId: String(trip), action, exited: true }));
      expect(await readTripMutation(db, String(who), body.client_request_id)).toMatchObject({
        status: 'committed',
        result: results[0],
      });
      expect(await readTripMutation(db, String(virtual), body.client_request_id)).toEqual({
        status: 'not_found',
      });
      await expect(readTripMutation(db, String(who), old.client_request_id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        write({ ...body, expected_revision: '0'.repeat(64) }, who)
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      if (action === 'leave')
        expect(await db.collection('expenses').countDocuments({ trip })).toBe(1);
    }
  );
  it('new accounting, same-count edits and Web removal invalidate destructive confirmation', async () => {
    let body = await input('delete');
    await db.collection('expenses').updateOne({ trip }, { $set: { amount: 99 } });
    await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    body = await input('delete');
    await db.collection('payments').insertOne({ trip, from: actor, to: peer, amount: 2 });
    await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    body = await input('delete');
    await removeTripMember(db, {
      tripId: String(trip),
      actorId: String(actor),
      targetId: String(peer),
    });
    await expect(write(body)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await db.collection('trips').countDocuments({ _id: trip })).toBe(1);
  });
  it('delete clears children atomically, preserves User and personal records, enqueues storage cleanup', async () => {
    for (const name of TRIP_CHILD_COLLECTIONS)
      if (!['expenses', 'payments', 'checklists', 'notifications'].includes(name))
        await db.collection(name).insertOne({ trip, data: 'owned' });
    await db.collection('flightrecords').insertOne({ trip, user: actor });
    await db.collection('stayrecords').insertOne({ trip, user: actor });
    await write(await input('delete'));
    for (const name of TRIP_CHILD_COLLECTIONS)
      expect(await db.collection(name).countDocuments({ trip })).toBe(0);
    expect(await db.collection('users').countDocuments()).toBe(3);
    for (const name of ['flightrecords', 'stayrecords'])
      expect(await db.collection(name).findOne({ user: actor })).toMatchObject({ trip: null });
    expect(await db.collection('tripcleanupjobs').countDocuments({ _id: trip })).toBe(1);
  });
  it.each(['remove', 'delete'] as const)(
    '%s and receipt roll back together on disk failure',
    async (action) => {
      const body = {
        ...(await input('delete')),
        action,
        ...(action === 'remove' ? { member_id: String(peer) } : {}),
      } as Parameters<typeof manageTripAccess>[3];
      const original = db.collection.bind(db),
        receipts = original(MUTATION_REQUESTS);
      const spy = vi.spyOn(receipts, 'insertOne').mockRejectedValueOnce(new Error('disk full'));
      const collection = vi
        .spyOn(db, 'collection')
        .mockImplementation((name, options) =>
          name === MUTATION_REQUESTS ? receipts : original(name, options)
        );
      try {
        await expect(write(body)).rejects.toThrow('disk full');
      } finally {
        spy.mockRestore();
        collection.mockRestore();
      }
      expect((await db.collection('trips').findOne({ _id: trip }))!.members).toHaveLength(3);
      expect(await db.collection('expenses').countDocuments({ trip })).toBe(1);
      expect(await db.collection('tripcleanupjobs').countDocuments()).toBe(0);
      expect(await readTripMutation(db, String(actor), body.client_request_id)).toEqual({
        status: 'not_found',
      });
    }
  );
});
