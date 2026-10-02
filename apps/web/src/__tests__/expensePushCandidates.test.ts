import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { createExpenseDeliveryEvent } from '@/lib/expenseDeliveryEvent';
import { createExpensePushCandidates } from '@/lib/expensePushCandidates';

const id = (n: number) => new mongo.ObjectId(n.toString(16).padStart(24, '0'));
const terminal = { status: 'accepted', recordedAt: new Date() };
function fixture() {
  const expense = {
    trip: id(2),
    createdBy: id(3),
    expenseDeliveryEvent: createExpenseDeliveryEvent({
      expenseId: id(1).toHexString(),
      tripId: id(2).toHexString(),
      actorId: id(3).toHexString(),
      actorName: 'Actor',
      tripName: 'Trip',
      tripHashCode: 'hash',
      memberIds: [3, 4, 5].map((n) => id(n).toHexString()),
      description: 'Dinner',
      amount: 10,
      occurredAt: new Date(),
    }),
    expenseDelivery: {
      recordRecipientIds: [3, 4, 6].map((n) => id(n).toHexString()),
      pushCheckpoints: {} as Record<string, unknown>,
    },
  };
  const findOne = vi.fn().mockResolvedValue(expense);
  const toArray = vi.fn().mockResolvedValue([{ _id: id(10) }]);
  const cursor = { sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray };
  const find = vi.fn().mockReturnValue(cursor);
  const collection = vi.fn((name: string) => (name === 'expenses' ? { findOne } : { find }));
  const discover = createExpensePushCandidates({ collection } as unknown as mongo.Db);
  return {
    expense,
    findOne,
    find,
    cursor,
    toArray,
    collection,
    run: () => discover(id(1), 'lease'),
  };
}

describe('dormant expense push candidate discovery', () => {
  it('queries only persisted event recipients, excludes actor, and bounds ID-only discovery', async () => {
    const f = fixture();
    f.expense.expenseDelivery.pushCheckpoints[id(9).toHexString()] = terminal;
    expect(await f.run()).toEqual({ status: 'ready', subscriptionIds: [id(10).toHexString()] });
    expect(f.find).toHaveBeenCalledWith(
      { user: { $in: [id(4)] }, _id: { $nin: [id(9)] } },
      {
        projection: { _id: 1 },
        readPreference: 'primary',
        maxTimeMS: 2000,
        timeoutMS: 2000,
      }
    );
    expect(f.cursor.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(f.cursor.limit).toHaveBeenCalledWith(256);
    expect(f.findOne).toHaveBeenCalledTimes(2);
    for (const [filter, options] of f.findOne.mock.calls) {
      expect(filter).toEqual({
        _id: id(1),
        'expenseDelivery.status': 'leased',
        'expenseDelivery.token': 'lease',
        'expenseDelivery.recordsPersistedAt': { $type: 'date' },
        $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
      });
      expect(options).toMatchObject({
        readPreference: 'primary',
        maxTimeMS: 2000,
        timeoutMS: 2000,
      });
    }
  });
  it('stops without subscription reads on missing lease', async () => {
    const f = fixture();
    f.findOne.mockResolvedValue(null);
    expect(await f.run()).toEqual({ status: 'stop' });
    expect(f.find).not.toHaveBeenCalled();
  });
  it('stops if lease is lost during discovery even for empty candidates', async () => {
    const f = fixture();
    f.toArray.mockResolvedValue([]);
    f.findOne.mockResolvedValueOnce(f.expense).mockResolvedValueOnce(null);
    expect(await f.run()).toEqual({ status: 'stop' });
  });
  it('avoids a device query for no recipients but still rechecks lease', async () => {
    const f = fixture();
    f.expense.expenseDelivery.recordRecipientIds = [];
    expect(await f.run()).toEqual({ status: 'ready', subscriptionIds: [] });
    expect(f.find).not.toHaveBeenCalled();
    expect(f.findOne).toHaveBeenCalledTimes(2);
  });
  it.each([256, 257])(
    'detects overflow without returning a truncated list: %i devices',
    async (count) => {
      const f = fixture();
      f.toArray.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ _id: id(i + 10) })));
      const result = await f.run();
      expect(result.status).toBe(count === 256 ? 'ready' : 'capacity');
      expect(f.cursor.limit).toHaveBeenCalledWith(257);
      if (result.status === 'ready') expect(result.subscriptionIds).toHaveLength(256);
    }
  );
  it.each([0, 1])(
    'at full checkpoint capacity probes one extra device: %i found',
    async (count) => {
      const f = fixture();
      f.expense.expenseDelivery.pushCheckpoints = Object.fromEntries(
        Array.from({ length: 256 }, (_, i) => [id(i + 100).toHexString(), terminal])
      );
      f.toArray.mockResolvedValue(count ? [{ _id: id(10) }] : []);
      expect((await f.run()).status).toBe(count ? 'capacity' : 'ready');
      expect(f.cursor.limit).toHaveBeenCalledWith(1);
    }
  );
  it('removes terminals added during discovery', async () => {
    const f = fixture();
    f.findOne.mockResolvedValueOnce(f.expense).mockResolvedValueOnce({
      expenseDelivery: { pushCheckpoints: { [id(10).toHexString()]: terminal } },
    });
    expect(await f.run()).toEqual({ status: 'ready', subscriptionIds: [] });
  });
  it('rechecks capacity against concurrent checkpoints', async () => {
    const f = fixture();
    f.findOne.mockResolvedValueOnce(f.expense).mockResolvedValueOnce({
      expenseDelivery: {
        pushCheckpoints: Object.fromEntries(
          Array.from({ length: 256 }, (_, i) => [id(i + 100).toHexString(), terminal])
        ),
      },
    });
    expect(await f.run()).toEqual({ status: 'capacity' });
  });
  it.each(['trip', 'createdBy'] as const)('rejects ownership mismatch: %s', async (field) => {
    const f = fixture();
    f.expense[field] = id(99);
    await expect(f.run()).rejects.toThrow('ownership mismatch');
    expect(f.find).not.toHaveBeenCalled();
  });
  it('rejects malformed persisted recipients', async () => {
    const f = fixture();
    f.expense.expenseDelivery.recordRecipientIds = ['bad'];
    await expect(f.run()).rejects.toThrow('Invalid persisted');
  });
  it.each([
    { bad: terminal },
    { [id(9).toHexString()]: { ...terminal, status: 'failed' } },
    { [id(9).toHexString()]: { ...terminal, recordedAt: 'today' } },
  ])('rejects corrupt checkpoints instead of excluding devices', async (checkpoints) => {
    const f = fixture();
    f.expense.expenseDelivery.pushCheckpoints = checkpoints;
    await expect(f.run()).rejects.toThrow('Invalid push checkpoints');
    expect(f.find).not.toHaveBeenCalled();
  });
  it('propagates query failures rather than returning empty success', async () => {
    const f = fixture();
    f.toArray.mockRejectedValue(new Error('timeout'));
    await expect(f.run()).rejects.toThrow('timeout');
  });
});
