// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose, { mongo } from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { Trip, Notification, ActivityLog } from '@/models';
import { notify } from '@/lib/notify';
import { logActivity } from '@/lib/activity';
import { removeTripMember } from '@/lib/memberRemoval';
import { deleteTripAtomically } from '@/lib/tripDeletion';
const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/webpush', () => ({ sendPush: mocks.push }));
vi.mock('@/lib/env', () => ({ getResendConfig: () => null }));
vi.mock('@/lib/email', () => ({ sendEmailBatch: vi.fn() }));
vi.mock('@/lib/emailTemplates', () => ({ buildNotificationEmail: vi.fn() }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
const actor = new mongo.ObjectId();
const recipient = new mongo.ObjectId();
describe.skipIf(!uri || !allowed)('trip effects against isolated replica set', () => {
  let owned = false;
  let tripId: string;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      dbName: `tb_effects_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await db.collection('users').insertMany([
      { _id: actor, displayName: 'Actor' },
      { _id: recipient, displayName: 'Recipient', isVirtual: false },
    ]);
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    tripId = (
      await Trip.create({
        name: 'Current',
        hashCode: randomUUID().slice(0, 8),
        members: [
          { user: actor, role: 'admin' },
          { user: recipient, role: 'member' },
        ],
      })
    ).id;
  });
  const event = () => ({ tripId, actorId: actor.toHexString(), type: 'expense_added' as const });
  it('commits notification rows before external delivery', async () => {
    let committed = false;
    mocks.push.mockImplementationOnce(async () => {
      committed = (await Notification.countDocuments({ trip: tripId })) === 1;
    });
    await notify(event());
    expect(committed).toBe(true);
    await logActivity(event());
    expect(await ActivityLog.countDocuments({ trip: tripId })).toBe(1);
  });
  it('cannot resurrect removed recipients from an old snapshot or explicit override', async () => {
    const snapshot = {
      id: tripId,
      name: 'Old',
      hashCode: 'old',
      memberIds: [actor.toHexString(), recipient.toHexString()],
    };
    await Promise.all([
      notify({ ...event(), tripSnapshot: snapshot, recipientIds: [recipient.toHexString()] }),
      removeTripMember(mongoose.connection.db!, {
        tripId,
        actorId: actor.toHexString(),
        targetId: recipient.toHexString(),
      }),
    ]);
    expect(await Notification.countDocuments({ trip: tripId, user: recipient })).toBe(0);
  });
  it('does not leave late notifications or activity after deleting a trip', async () => {
    await Promise.all([
      notify(event()),
      logActivity(event()),
      deleteTripAtomically(mongoose.connection.db!, tripId, actor.toHexString()),
    ]);
    expect(await Notification.countDocuments({ trip: tripId })).toBe(0);
    expect(await ActivityLog.countDocuments({ trip: tripId })).toBe(0);
  });
  it('rolls back inserted notifications on failure and does not send push', async () => {
    const original = mongo.Collection.prototype.insertMany;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'insertMany')
      .mockImplementation(async function (this: mongo.Collection, ...args) {
        const result = await original.apply(this, args);
        if (this.collectionName === 'notifications')
          throw new Error('Injected notification failure');
        return result;
      });
    try {
      await notify(event());
    } finally {
      spy.mockRestore();
    }
    expect(await Notification.countDocuments({ trip: tripId })).toBe(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
