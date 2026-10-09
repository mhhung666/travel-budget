// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mongo } from 'mongoose';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as memberManagementLib from '@/lib/memberManagement';
import * as memberIdentityLib from '@/lib/memberIdentity';
import * as tripEntryLib from '@/lib/tripEntry';
import { inLedgerContext } from '@/test/ledgerContext';
// Each call is one v2 request, as through the Web action or `/api/v2`.
const readTripMembers = inLedgerContext(memberManagementLib.readTripMembers);
const manageMember = inLedgerContext(memberManagementLib.manageMember);
const createVirtualMemberForActor = inLedgerContext(
  memberManagementLib.createVirtualMemberForActor
);
const changeMemberIdentity = inLedgerContext(memberIdentityLib.changeMemberIdentity);
const readTripMutation = inLedgerContext(tripEntryLib.readTripMutation);
const { MUTATION_REQUESTS } = tripEntryLib;
interface FixtureTrip {
  _id: mongo.ObjectId;
  hashCode?: string;
  members: { user: mongo.ObjectId; role?: string; joinedAt?: Date; budget?: number }[];
}
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Isolated URI and write opt-in required');
describe.skipIf(!uri || !allowed)('G1b isolated member management', () => {
  let client: mongo.MongoClient,
    db: mongo.Db,
    owned = false;
  const actor = new mongo.ObjectId(),
    peer = new mongo.ObjectId(),
    virtual = new mongo.ObjectId(),
    trip = new mongo.ObjectId();
  const secret = 'g1b-isolated-secret';
  const context = (id = actor) => readTripMembers(db, id.toString(), trip.toString(), secret);
  const body = async (name = 'New') => ({
    client_request_id: randomUUID(),
    expected_revision: (await context()).revision,
    display_name: name,
  });
  const write = (input: Awaited<ReturnType<typeof body>>, id?: string) =>
    manageMember(
      db,
      actor.toString(),
      trip.toString(),
      id ? 'member.rename' : 'member.create',
      input,
      secret,
      id
    );
  beforeAll(async () => {
    client = new mongo.MongoClient(uri!);
    await client.connect();
    db = client.db(`tb_g1b_${randomUUID().replaceAll('-', '')}`);
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  });
  afterAll(async () => {
    try {
      if (owned) await db.dropDatabase();
    } finally {
      await client?.close();
    }
  });
  beforeEach(async () => {
    for (const name of ['trips', 'users', 'expenses', 'payments', MUTATION_REQUESTS])
      await db.collection(name).deleteMany({});
    await db.collection('users').insertMany([
      {
        _id: actor,
        username: 'login-admin',
        email: 'private-admin',
        displayName: 'Alice',
        password: 'secret',
      },
      {
        _id: peer,
        username: 'login-peer',
        email: 'private-peer',
        displayName: 'Alice',
        password: 'secret',
      },
      {
        _id: virtual,
        username: 'virtual-original',
        email: 'private-virtual',
        displayName: 'Virtual',
        isVirtual: true,
      },
    ]);
    await db.collection<FixtureTrip>('trips').insertOne({
      _id: trip,
      hashCode: 'invitation-secret',
      members: [
        { user: actor, role: 'admin', joinedAt: new Date('2026-01-02'), budget: 999 },
        { user: peer, role: 'member', joinedAt: new Date('2026-01-01') },
        { user: virtual, role: 'member', joinedAt: new Date('2026-01-02') },
      ],
    });
  });
  it('member roster is ordered, whitelisted and visible to a member without granting administration', async () => {
    const c = await context(peer);
    expect(c.members.map((m) => m.id)).toEqual([peer, actor, virtual].map(String));
    expect(c.members.map((m) => m.isVirtual)).toEqual([false, false, true]);
    expect(c.role).toBe('member');
    expect(JSON.stringify(c)).not.toMatch(/username|email|password|budget|hashCode|secret/);
    const input = await body();
    await expect(
      manageMember(db, peer.toString(), trip.toString(), 'member.create', input, secret)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await readTripMutation(db, peer.toString(), input.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'FORBIDDEN',
    });
    expect(await db.collection('users').countDocuments()).toBe(3);
  });
  it('parallel UUID replays create one user, one membership and one receipt, even after a lost response', async () => {
    const input = await body(' Alice ');
    const results = await Promise.all(Array.from({ length: 5 }, () => write(input)));
    expect(new Set(results.map((r) => r.memberId)).size).toBe(1);
    expect(await db.collection('users').countDocuments()).toBe(4);
    expect((await context()).members).toHaveLength(4);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(1);
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      status: 'committed',
      resourceId: results[0].memberId,
      result: results[0],
    });
    await expect(write({ ...input, display_name: 'Different' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const user = await db
      .collection('users')
      .findOne({ _id: new mongo.ObjectId(results[0].memberId) });
    expect(user).toMatchObject({ displayName: 'Alice', isVirtual: true });
    expect(user!.username).toMatch(/^virtual_/);
    expect(user!.password).toBeTruthy();
  });
  it('different UUIDs from the same roster cannot silently create duplicates', async () => {
    const input = await body();
    const outcomes = await Promise.allSettled([
      write(input),
      write({ ...input, client_request_id: randomUUID() }),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('users').countDocuments()).toBe(4);
    expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(2);
  });
  it('Web creation uses the same writer and makes a pending mobile roster stale', async () => {
    const input = await body();
    const member = await createVirtualMemberForActor(
      db,
      actor.toString(),
      trip.toString(),
      'Web virtual'
    );
    expect(member).toMatchObject({ is_virtual: true, role: 'member', display_name: 'Web virtual' });
    await expect(write(input)).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_CHANGED',
    });
    expect(await db.collection('users').countDocuments()).toBe(4);
  });
  it('rename preserves identity, money, references and other fields; replay does not rename again', async () => {
    await db.collection('expenses').insertOne({
      trip,
      payer: virtual,
      amount: 30,
      splits: [{ user: virtual, shareAmount: 30 }],
      receipt: 'keep',
    });
    await db.collection('payments').insertOne({ trip, from: virtual, to: actor, amount: 10 });
    const expense = await db.collection('expenses').findOne({ trip }),
      payment = await db.collection('payments').findOne({ trip });
    const input = await body('Renamed');
    const result = await write(input, virtual.toString());
    expect((await context()).members.find((m) => m.id === virtual.toString())!.displayName).toBe(
      'Renamed'
    );
    expect(await db.collection('expenses').findOne({ trip })).toEqual(expense);
    expect(await db.collection('payments').findOne({ trip })).toEqual(payment);
    await db.collection('users').updateOne({ _id: virtual }, { $set: { displayName: 'Later' } });
    expect(await write(input, virtual.toString())).toEqual(result);
    expect((await context()).members.find((m) => m.id === virtual.toString())!.displayName).toBe(
      'Later'
    );
  });
  it.each(['removed', 'claimed', 'real'] as const)(
    '%s targets are terminally rejected and never change real profiles',
    async (kind) => {
      const input = await body('Unsafe');
      let id = virtual;
      if (kind === 'removed')
        await db
          .collection<FixtureTrip>('trips')
          .updateOne({ _id: trip }, { $pull: { members: { user: virtual } } });
      if (kind === 'claimed')
        await changeMemberIdentity(db, {
          tripId: trip.toString(),
          virtualUserId: virtual.toString(),
          hashCode: 'invitation-secret',
          kind: 'register',
          username: 'claimed',
          displayName: 'Claimed',
          email: 'claimed@local',
          password: 'hash',
        });
      if (kind === 'real') id = peer;
      await expect(write(input, id.toString())).rejects.toMatchObject({ code: 'RESOURCE_GONE' });
      expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
        status: 'rejected',
        code: 'RESOURCE_GONE',
      });
      expect((await db.collection('users').findOne({ _id: id }))!.displayName).not.toBe('Unsafe');
    }
  );
  it('claim in another trip serializes with rename and cannot leave a renamed real profile', async () => {
    const other = new mongo.ObjectId();
    await db.collection<FixtureTrip>('trips').insertOne({
      _id: other,
      hashCode: 'other-code',
      members: [
        { user: actor, role: 'admin' },
        { user: virtual, role: 'member' },
      ],
    });
    const input = await body('Admin rename');
    const [rename, claim] = await Promise.allSettled([
      write(input, virtual.toString()),
      changeMemberIdentity(db, {
        tripId: other.toString(),
        virtualUserId: virtual.toString(),
        hashCode: 'other-code',
        kind: 'register',
        username: 'claimed',
        displayName: 'Claimed',
        email: 'claimed@local',
        password: 'hash',
      }),
    ]);
    expect(claim.status).toBe('fulfilled');
    if (rename.status === 'rejected')
      expect(rename.reason).toMatchObject({ code: 'RESOURCE_GONE' });
    const person = await db.collection('users').findOne({ _id: virtual });
    expect(person).toMatchObject({ isVirtual: false, displayName: 'Claimed' });
  });
  it('new demoted operations reject but committed receipts remain readable; removal hides both reads and replays', async () => {
    const input = await body();
    const result = await write(input);
    await db
      .collection<FixtureTrip>('trips')
      .updateOne({ _id: trip, 'members.user': actor }, { $set: { 'members.$.role': 'member' } });
    expect(await write(input)).toEqual(result);
    expect(await readTripMutation(db, actor.toString(), input.client_request_id)).toMatchObject({
      status: 'committed',
    });
    await expect(write({ ...input, client_request_id: randomUUID() })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await db
      .collection<FixtureTrip>('trips')
      .updateOne({ _id: trip }, { $pull: { members: { user: actor } } });
    await expect(context()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(write(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      readTripMutation(db, actor.toString(), input.client_request_id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each(['create', 'rename'] as const)(
    'receipt failure rolls back %s and its receipt together',
    async (kind) => {
      const input = await body(),
        original = mongo.Collection.prototype.insertOne;
      const spy = vi
        .spyOn(mongo.Collection.prototype, 'insertOne')
        .mockImplementation(async function (this: mongo.Collection, ...args) {
          if (this.collectionName === MUTATION_REQUESTS)
            throw new Error('Injected receipt failure');
          return original.apply(this, args);
        });
      try {
        await expect(
          write(input, kind === 'rename' ? virtual.toString() : undefined)
        ).rejects.toThrow('Injected receipt failure');
      } finally {
        spy.mockRestore();
      }
      expect(await db.collection('users').countDocuments()).toBe(3);
      expect((await context()).members).toHaveLength(3);
      expect(await db.collection(MUTATION_REQUESTS).countDocuments()).toBe(0);
      expect((await db.collection('users').findOne({ _id: virtual }))!.displayName).toBe('Virtual');
    }
  );
});
