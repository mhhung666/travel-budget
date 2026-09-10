// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeMemberIdentity } from '@/lib/memberIdentity';
import { removeTripMember } from '@/lib/memberRemoval';

const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Member integration requires URI and write opt-in');
const trip = new mongo.ObjectId();
const virtual = new mongo.ObjectId();
const real = new mongo.ObjectId();
const other = new mongo.ObjectId();
const base = {
  tripId: trip.toHexString(),
  virtualUserId: virtual.toHexString(),
  hashCode: 'claim123',
};
const link = {
  ...base,
  kind: 'link' as const,
  realUserId: real.toHexString(),
  passwordHash: 'hash',
};
const register = {
  ...base,
  kind: 'register' as const,
  username: 'new',
  displayName: 'New',
  email: 'new@example.test',
  password: 'newhash',
};

describe.skipIf(!uri || !allowed)('member identity transactions in isolated MongoDB', () => {
  let db: mongo.Db;
  let owned = false;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_member_verify_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
    });
    db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    for (const name of ['trips', 'users', 'expenses', 'payments', 'checklists', 'notifications'])
      await db.collection(name).deleteMany({});
    await db.collection('users').insertMany([
      { _id: virtual, username: 'virtual', isVirtual: true },
      { _id: real, username: 'real', isVirtual: false, password: 'hash' },
    ]);
    await db.collection('trips').insertOne({
      _id: trip,
      hashCode: 'claim123',
      members: [{ user: virtual, role: 'member', budget: { total: 100 } }],
    });
    await db.collection('expenses').insertMany([
      { trip, payer: virtual, splits: [{ user: virtual, amount: 40 }], createdBy: virtual },
      { trip: other, payer: virtual, splits: [{ user: virtual }] },
    ]);
    await db.collection('payments').insertOne({ trip, from: virtual, to: other, amount: 40 });
    await db
      .collection('checklists')
      .insertOne({ trip, items: [{ assignee: virtual, doneBy: [virtual, real] }] });
    await db.collection('notifications').insertOne({ trip, user: virtual });
  });
  it('moves financial and checklist references only in the claimed trip, preserving history and member settings', async () => {
    await changeMemberIdentity(db, link);
    const expense = await db.collection('expenses').findOne({ trip });
    expect(expense?.payer).toEqual(real);
    expect(expense?.splits[0]).toEqual({ user: real, amount: 40 });
    expect(expense?.createdBy).toEqual(virtual);
    expect((await db.collection('expenses').findOne({ trip: other }))?.payer).toEqual(virtual);
    expect((await db.collection('payments').findOne({ trip }))?.from).toEqual(real);
    expect((await db.collection('checklists').findOne({ trip }))?.items).toEqual([
      { assignee: real, doneBy: [real] },
    ]);
    expect((await db.collection('trips').findOne({ _id: trip }))?.members[0]).toEqual({
      user: real,
      role: 'member',
      budget: { total: 100 },
    });
    expect(await db.collection('users').findOne({ _id: virtual })).not.toBeNull();
    expect(await db.collection('notifications').countDocuments({ trip })).toBe(0);
  });
  it('rolls all earlier writes back when late cleanup fails', async () => {
    const original = mongo.Collection.prototype.deleteMany;
    vi.spyOn(mongo.Collection.prototype, 'deleteMany').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'notifications') throw new Error('injected cleanup failure');
      return original.apply(this, args);
    });
    await expect(changeMemberIdentity(db, link)).rejects.toThrow('injected');
    expect((await db.collection('trips').findOne({ _id: trip }))?.members[0].user).toEqual(virtual);
    expect((await db.collection('expenses').findOne({ trip }))?.payer).toEqual(virtual);
    expect((await db.collection('payments').findOne({ trip }))?.from).toEqual(virtual);
    expect((await db.collection('checklists').findOne({ trip }))?.items[0].assignee).toEqual(
      virtual
    );
  });
  it('permits exactly one competing registration/claim', async () => {
    const results = await Promise.allSettled([
      changeMemberIdentity(db, register),
      changeMemberIdentity(db, link),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const user = await db.collection('users').findOne({ _id: virtual });
    const member = (await db.collection('trips').findOne({ _id: trip }))?.members[0].user;
    expect(user?.isVirtual ? member.equals(real) : member.equals(virtual)).toBe(true);
  });
  it.each(['revoked', 'removed', 'deleting', 'password', 'already'])(
    'rechecks %s state and commits no financial changes',
    async (condition) => {
      if (condition === 'revoked')
        await db.collection('trips').updateOne({ _id: trip }, { $set: { hashCode: 'revoked' } });
      if (condition === 'removed')
        await db.collection('trips').updateOne({ _id: trip }, { $set: { members: [] } });
      if (condition === 'deleting')
        await db
          .collection('trips')
          .updateOne({ _id: trip }, { $set: { expenseDeliveryDeleting: true } });
      if (condition === 'password')
        await db.collection('users').updateOne({ _id: real }, { $set: { password: 'changed' } });
      if (condition === 'already')
        await db
          .collection('trips')
          .updateOne({ _id: trip }, { $set: { members: [{ user: virtual }, { user: real }] } });
      await expect(changeMemberIdentity(db, link)).rejects.toThrow();
      expect((await db.collection('expenses').findOne({ trip }))?.payer).toEqual(virtual);
    }
  );
  it('duplicate registration rolls back the parent and leaves virtual credentials unchanged', async () => {
    await expect(changeMemberIdentity(db, { ...register, username: 'real' })).rejects.toMatchObject(
      { code: 11000 }
    );
    expect((await db.collection('users').findOne({ _id: virtual }))?.isVirtual).toBe(true);
    expect(
      (await db.collection('trips').findOne({ _id: trip }))?.expenseDeliveryFence
    ).toBeUndefined();
  });
  async function removalFixture() {
    await db.collection('trips').updateOne(
      { _id: trip },
      {
        $set: {
          members: [
            { user: virtual, role: 'member' },
            { user: other, role: 'admin' },
          ],
        },
      }
    );
    return {
      tripId: trip.toHexString(),
      actorId: other.toHexString(),
      targetId: virtual.toHexString(),
    };
  }
  it('removes membership, assignments and notifications together while retaining financial history', async () => {
    const input = await removalFixture();
    expect(await removeTripMember(db, input)).toEqual({ hasExpenses: true });
    expect((await db.collection('trips').findOne({ _id: trip }))?.members).toEqual([
      { user: other, role: 'admin' },
    ]);
    expect((await db.collection('checklists').findOne({ trip }))?.items).toEqual([
      { assignee: null, doneBy: [real] },
    ]);
    expect(await db.collection('notifications').countDocuments({ trip })).toBe(0);
    expect((await db.collection('expenses').findOne({ trip }))?.payer).toEqual(virtual);
    expect((await db.collection('payments').findOne({ trip }))?.from).toEqual(virtual);
    expect(await db.collection('users').findOne({ _id: virtual })).not.toBeNull();
  });
  it('rolls removal and assignments back on notification cleanup failure', async () => {
    const input = await removalFixture();
    const original = mongo.Collection.prototype.deleteMany;
    vi.spyOn(mongo.Collection.prototype, 'deleteMany').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'notifications') throw new Error('removal cleanup failure');
      return original.apply(this, args);
    });
    await expect(removeTripMember(db, input)).rejects.toThrow('removal cleanup failure');
    expect((await db.collection('trips').findOne({ _id: trip }))?.members).toHaveLength(2);
    expect((await db.collection('checklists').findOne({ trip }))?.items[0].assignee).toEqual(
      virtual
    );
  });
  it('serializes member removal against identity linking', async () => {
    const input = await removalFixture();
    const results = await Promise.allSettled([
      removeTripMember(db, input),
      changeMemberIdentity(db, link),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const parent = await db.collection('trips').findOne({ _id: trip });
    expect(parent?.members.some((m: { user: mongo.ObjectId }) => m.user.equals(virtual))).toBe(
      false
    );
    const linked = parent?.members.some((m: { user: mongo.ObjectId }) => m.user.equals(real));
    expect((await db.collection('expenses').findOne({ trip }))?.payer).toEqual(
      linked ? real : virtual
    );
  });
  it('rejects stale admin authorization and self-removal', async () => {
    const input = await removalFixture();
    await expect(removeTripMember(db, { ...input, targetId: input.actorId })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' }
    );
    await db
      .collection('trips')
      .updateOne({ _id: trip, 'members.user': other }, { $set: { 'members.$.role': 'member' } });
    await expect(removeTripMember(db, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db.collection('trips').findOne({ _id: trip }))?.members).toHaveLength(2);
  });
});
