import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { createExpenseDeliveryEvent } from '@/lib/expenseDeliveryEvent';
import { createExpensePushPrepare } from '@/lib/expensePushPrepare';
import { executeExpensePushBatch } from '@/lib/expensePushExecutor';

vi.mock('@/lib/webpush', () => ({ buildPushPayload: vi.fn() }));
vi.mock('@/lib/expensePushTransport', () => ({ sendExpensePushDevice: vi.fn() }));

const expenseId = new mongo.ObjectId('000000000000000000000001');
const tripId = new mongo.ObjectId('000000000000000000000002');
const actorId = new mongo.ObjectId('000000000000000000000003');
const userId = new mongo.ObjectId('000000000000000000000004');
const subscriptionId = '000000000000000000000005';
const otherId = '000000000000000000000006';
const event = createExpenseDeliveryEvent({
  expenseId: expenseId.toHexString(),
  tripId: tripId.toHexString(),
  actorId: actorId.toHexString(),
  actorName: 'Actor snapshot',
  tripName: 'Trip snapshot',
  tripHashCode: 'public-hash',
  memberIds: [actorId.toHexString(), userId.toHexString()],
  description: 'Dinner snapshot',
  amount: 123,
  occurredAt: new Date('2026-09-06'),
});
const config = {
  vapidDetails: { subject: 'mailto:test@example.com', publicKey: 'public', privateKey: 'private' },
  appUrl: 'https://example.com///',
};
const payload = { title: 'title', body: 'body', url: '/trip' };

function fixture() {
  const expense = {
    _id: expenseId,
    trip: tripId,
    createdBy: actorId,
    expenseDeliveryEvent: structuredClone(event),
    expenseDelivery: { recordRecipientIds: [userId.toHexString()] },
  };
  const trip = { members: [{ user: actorId }, { user: userId }] };
  const subscription = {
    user: userId,
    endpoint: 'https://push.example.com/device',
    keys: { auth: 'auth', p256dh: 'key' },
  };
  const queries = {
    expenses: vi.fn().mockResolvedValue(expense),
    trips: vi.fn().mockResolvedValue(trip),
    pushsubscriptions: vi.fn().mockResolvedValue(subscription),
    users: vi.fn().mockResolvedValue({ locale: 'en' }),
  };
  const deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
  const collection = vi.fn((name: keyof typeof queries) => ({ findOne: queries[name], deleteOne }));
  const buildPayload = vi.fn().mockResolvedValue(payload);
  const sendDevice = vi.fn().mockResolvedValue('accepted');
  const options = { config, buildPayload, sendDevice };
  const db = { collection } as unknown as mongo.Db;
  return {
    expense,
    trip,
    subscription,
    queries,
    collection,
    buildPayload,
    sendDevice,
    options,
    prepare: createExpensePushPrepare(db, expenseId, 'lease-token', options),
    db,
    deleteOne,
  };
}

describe('dormant expense push preparation', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['endpoint', 'auth', 'p256dh'])(
    'rejects an incomplete cleanup identity: %s',
    async (field) => {
      const f = fixture();
      if (field === 'endpoint') f.subscription.endpoint = '';
      else f.subscription.keys[field as 'auth' | 'p256dh'] = '';
      await expect(f.prepare(subscriptionId)).rejects.toThrow('Invalid push subscription');
      expect(f.sendDevice).not.toHaveBeenCalled();
      expect(f.deleteOne).not.toHaveBeenCalled();
    }
  );

  it('cleans only the original expired subscription after checkpoint confirmation', async () => {
    const f = fixture();
    f.sendDevice.mockResolvedValue('expired');
    const progress = {};
    const record = vi.fn().mockImplementation(async () => {
      expect(f.deleteOne).not.toHaveBeenCalled();
      Object.assign(progress, { [subscriptionId]: { status: 'expired', recordedAt: new Date() } });
      return true;
    });
    const result = await executeExpensePushBatch([subscriptionId], {
      read: async () => progress,
      record,
      prepare: f.prepare,
    });
    expect(result).toMatchObject({ status: 'exhausted', checkpointed: 1, cleanupFailed: 0 });
    expect(f.deleteOne).toHaveBeenCalledExactlyOnceWith(
      {
        _id: new mongo.ObjectId(subscriptionId),
        user: userId,
        endpoint: f.subscription.endpoint,
        'keys.p256dh': 'key',
        'keys.auth': 'auth',
      },
      { maxTimeMS: 2_000, timeoutMS: 2_000, collation: { locale: 'simple' } }
    );
  });

  it.each(['accepted', 'failed'])('never cleans a %s delivery', async (outcome) => {
    const f = fixture();
    f.sendDevice.mockResolvedValue(outcome);
    const ready = await f.prepare(subscriptionId);
    if (ready.status !== 'ready') throw new Error('Expected ready');
    await ready.cleanupExpired?.();
    await ready.send();
    await ready.cleanupExpired?.();
    expect(f.deleteOne).not.toHaveBeenCalled();
  });

  it('captures immutable send/cleanup identity and treats no match as successful no-op', async () => {
    const f = fixture();
    f.sendDevice.mockResolvedValue('expired');
    f.deleteOne.mockResolvedValue({ deletedCount: 0 });
    const ready = await f.prepare(subscriptionId);
    if (ready.status !== 'ready') throw new Error('Expected ready');
    await ready.cleanupExpired?.();
    expect(f.deleteOne).not.toHaveBeenCalled();
    f.subscription.endpoint = 'https://push.example.com/updated';
    f.subscription.keys.auth = 'updated';
    f.subscription.keys.p256dh = 'updated';
    f.subscription.user = new mongo.ObjectId(otherId);
    await ready.send();
    await ready.cleanupExpired?.();
    await ready.cleanupExpired?.();
    expect(f.sendDevice.mock.calls[0][0].subscription).toEqual({
      endpoint: 'https://push.example.com/device',
      keys: { auth: 'auth', p256dh: 'key' },
    });
    expect(f.deleteOne).toHaveBeenCalledOnce();
    expect(f.deleteOne.mock.calls[0][0]).toMatchObject({
      user: userId,
      endpoint: 'https://push.example.com/device',
      'keys.auth': 'auth',
      'keys.p256dh': 'key',
    });
  });

  it('does not retry cleanup within the prepared sender after a DB error', async () => {
    const f = fixture();
    f.sendDevice.mockResolvedValue('expired');
    f.deleteOne.mockRejectedValue(new Error('DB unavailable'));
    const ready = await f.prepare(subscriptionId);
    if (ready.status !== 'ready') throw new Error('Expected ready');
    await ready.send();
    await expect(ready.cleanupExpired?.()).rejects.toThrow('DB unavailable');
    await ready.cleanupExpired?.();
    expect(f.deleteOne).toHaveBeenCalledOnce();
  });

  it('executor stops without HTTP when lease is lost after preparation', async () => {
    const f = fixture();
    const read = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(null);
    const record = vi.fn();
    expect(
      await executeExpensePushBatch([subscriptionId], { read, record, prepare: f.prepare })
    ).toMatchObject({ status: 'stopped', attempted: 0 });
    expect(f.buildPayload).toHaveBeenCalledOnce();
    expect(f.sendDevice).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('executor immediately checkpoints the prepared expired result', async () => {
    const f = fixture();
    f.sendDevice.mockResolvedValue('expired');
    const record = vi.fn().mockResolvedValue(true);
    expect(
      await executeExpensePushBatch([subscriptionId], {
        read: vi.fn().mockResolvedValue({}),
        record,
        prepare: f.prepare,
      })
    ).toMatchObject({ status: 'exhausted', attempted: 1, checkpointed: 1 });
    expect(record).toHaveBeenCalledWith(subscriptionId, 'expired');
  });

  it('checks lease, current membership, first recipients and real subscription owner before preparing snapshot payload', async () => {
    const f = fixture();
    const result = await f.prepare(subscriptionId);
    expect(result.status).toBe('ready');
    expect(f.sendDevice).not.toHaveBeenCalled();
    expect(f.queries.expenses.mock.calls[0][0]).toEqual({
      _id: expenseId,
      'expenseDelivery.status': 'leased',
      'expenseDelivery.token': 'lease-token',
      'expenseDelivery.recordsPersistedAt': { $type: 'date' },
      $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
    });
    expect(f.queries.trips.mock.calls[0][0]).toEqual({
      _id: tripId,
      expenseDeliveryDeleting: { $ne: true },
    });
    expect(f.queries.pushsubscriptions.mock.calls[0][0]).toEqual({
      _id: new mongo.ObjectId(subscriptionId),
      user: { $in: [userId] },
    });
    expect(f.queries.users.mock.calls[0][0]).toEqual({ _id: userId, isVirtual: { $ne: true } });
    for (const query of Object.values(f.queries))
      expect(query.mock.calls[0][1]).toMatchObject({
        maxTimeMS: 2000,
        timeoutMS: 2000,
        readPreference: 'primary',
        projection: expect.any(Object),
      });
    expect(f.buildPayload).toHaveBeenCalledWith({
      type: 'expense_added',
      locale: 'en',
      actorName: event.actorName,
      tripHashCode: event.tripHashCode,
      tripName: event.tripName,
      meta: { expense_id: event.expenseId, description: event.description, amount: event.amount },
      appUrl: 'https://example.com',
    });
    if (result.status !== 'ready') throw new Error('Expected ready');
    expect(await result.send()).toBe('accepted');
    expect(f.sendDevice).toHaveBeenCalledWith({
      subscription: { endpoint: f.subscription.endpoint, keys: f.subscription.keys },
      payload,
      vapidDetails: config.vapidDetails,
    });
    await expect(result.send()).rejects.toThrow('already used');
    expect(f.sendDevice).toHaveBeenCalledTimes(1);
  });

  it('disabled does not query or send', async () => {
    const f = fixture();
    expect(
      await createExpensePushPrepare(f.db, expenseId, 'lease', { ...f.options, config: null })(
        subscriptionId
      )
    ).toEqual({ status: 'disabled' });
    expect(f.collection).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs before DB access', async () => {
    const f = fixture();
    await expect(f.prepare('invalid')).rejects.toThrow('Invalid subscription ID');
    expect(f.collection).not.toHaveBeenCalled();
  });

  it.each(['expenses', 'trips'] as const)('stops for missing/inactive %s', async (name) => {
    const f = fixture();
    f.queries[name].mockResolvedValue(null);
    expect(await f.prepare(subscriptionId)).toEqual({ status: 'stop' });
    expect(f.buildPayload).not.toHaveBeenCalled();
  });

  it.each(['pushsubscriptions', 'users'] as const)('skips absent/ineligible %s', async (name) => {
    const f = fixture();
    f.queries[name].mockResolvedValue(null);
    expect(await f.prepare(subscriptionId)).toEqual({ status: 'skip' });
    expect(f.buildPayload).not.toHaveBeenCalled();
  });

  it.each(['removed', 'not-persisted', 'not-event-member', 'actor-only'] as const)(
    'excludes %s recipients before subscription lookup',
    async (scenario) => {
      const f = fixture();
      if (scenario === 'removed') f.trip.members = [{ user: actorId }];
      if (scenario === 'not-persisted') f.expense.expenseDelivery.recordRecipientIds = [otherId];
      if (scenario === 'not-event-member')
        f.expense.expenseDeliveryEvent.memberIds = [actorId.toHexString()];
      if (scenario === 'actor-only')
        f.expense.expenseDelivery.recordRecipientIds = [actorId.toHexString()];
      expect(await f.prepare(subscriptionId)).toEqual({ status: 'skip' });
      expect(f.queries.pushsubscriptions).not.toHaveBeenCalled();
    }
  );

  it.each(['trip', 'createdBy', '_id'] as const)(
    'rejects event ownership mismatch for %s',
    async (field) => {
      const f = fixture();
      if (field === '_id') {
        f.expense.expenseDeliveryEvent.expenseId = otherId;
        f.expense.expenseDeliveryEvent.eventKey = `expense_added:${otherId}`;
      } else f.expense[field] = new mongo.ObjectId(otherId);
      await expect(f.prepare(subscriptionId)).rejects.toThrow('ownership mismatch');
      expect(f.queries.trips).not.toHaveBeenCalled();
    }
  );

  it('rejects corrupt persisted recipients instead of treating them as empty success', async () => {
    const f = fixture();
    f.expense.expenseDelivery.recordRecipientIds = ['invalid'];
    await expect(f.prepare(subscriptionId)).rejects.toThrow('Invalid persisted');
  });

  it.each(['expenses', 'trips', 'pushsubscriptions', 'users'] as const)(
    'propagates %s query failures without sending',
    async (name) => {
      const f = fixture();
      f.queries[name].mockRejectedValue(new Error('DB unavailable'));
      await expect(f.prepare(subscriptionId)).rejects.toThrow('DB unavailable');
      expect(f.sendDevice).not.toHaveBeenCalled();
    }
  );

  it('uses locale fallback and preserves expired without cleanup writes', async () => {
    const f = fixture();
    f.queries.users.mockResolvedValue({});
    f.sendDevice.mockResolvedValue('expired');
    const result = await f.prepare(subscriptionId);
    expect(f.buildPayload).toHaveBeenCalledWith(expect.objectContaining({ locale: 'zh' }));
    if (result.status !== 'ready') throw new Error('Expected ready');
    expect(await result.send()).toBe('expired');
    expect(f.collection).toHaveBeenCalledTimes(4);
  });

  it('propagates localization and send failures', async () => {
    const f = fixture();
    f.buildPayload.mockRejectedValueOnce(new Error('catalog failed'));
    await expect(f.prepare(subscriptionId)).rejects.toThrow('catalog failed');
    const result = await f.prepare(subscriptionId);
    if (result.status !== 'ready') throw new Error('Expected ready');
    f.sendDevice.mockRejectedValue(new Error('transport failed'));
    await expect(result.send()).rejects.toThrow('transport failed');
  });
});
