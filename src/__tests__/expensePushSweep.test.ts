import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { createExpensePushSweep, type ExpensePushSweep } from '@/lib/expensePushSweep';
import type { ExpenseDeliveryRecord } from '@/lib/expenseDeliveryQueue';

const id = new mongo.ObjectId();
const ids = [new mongo.ObjectId().toHexString(), new mongo.ObjectId().toHexString()];
const initial = (): ExpensePushSweep => ({
  snapshotId: '00000000-0000-4000-8000-000000000001',
  subscriptionIds: [...ids],
  nextIndex: 0,
  hadFailures: false,
  revision: 0,
  status: 'running',
});
const yielded = (nextIndex = 1, hadFailures = false) => ({
  status: 'yielded' as const,
  continuation: { subscriptionIds: [...ids], nextIndex, hadFailures },
});
function fixture() {
  const findOne = vi.fn();
  const updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
  const store = createExpensePushSweep({
    findOne,
    updateOne,
  } as unknown as mongo.Collection<ExpenseDeliveryRecord>);
  return { store, findOne, updateOne };
}
describe('dormant persisted push sweep', () => {
  it('distinguishes missing state, missing lease, and a saved sweep', async () => {
    const f = fixture();
    f.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ expenseDelivery: {} })
      .mockResolvedValueOnce({ expenseDelivery: { pushSweep: initial() } });
    expect(await f.store.read(id, 'lease')).toEqual({ status: 'stop' });
    expect(await f.store.read(id, 'lease')).toEqual({ status: 'missing' });
    expect(await f.store.read(id, 'lease')).toEqual({ status: 'ready', sweep: initial() });
    expect(f.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: id,
        'expenseDelivery.token': 'lease',
        'expenseDelivery.status': 'leased',
        'expenseDelivery.recordsPersistedAt': { $type: 'date' },
        $expr: { $gt: ['$expenseDelivery.availableAt', '$$NOW'] },
      }),
      {
        projection: { 'expenseDelivery.pushSweep': 1 },
        readPreference: 'primary',
        maxTimeMS: 2000,
        timeoutMS: 2000,
      }
    );
  });
  it('initializes once under lease and atomic checkpoint union capacity guard', async () => {
    const f = fixture();
    expect(await f.store.initialize(id, 'lease', ids)).toBe(true);
    const [filter, update, options] = f.updateOne.mock.calls[0];
    expect(filter['expenseDelivery.pushSweep']).toEqual({ $exists: false });
    expect(filter.$expr.$and[0]).toEqual({ $gt: ['$expenseDelivery.availableAt', '$$NOW'] });
    expect(filter.$expr.$and[1].$lte[1]).toBe(256);
    expect(filter.$expr.$and[1].$lte[0].$size.$setUnion[0]).toEqual({ $literal: ids });
    expect(update.$set['expenseDelivery.pushSweep']).toMatchObject({
      subscriptionIds: ids,
      nextIndex: 0,
      revision: 0,
      status: 'running',
      hadFailures: false,
    });
    expect(options).toEqual({ maxTimeMS: 2000, timeoutMS: 2000, writeConcern: { w: 'majority' } });
  });
  it.each([{ list: [] }, { list: ids }])(
    'supports empty and nonempty fixed lists',
    async ({ list }) => {
      const f = fixture();
      expect(await f.store.initialize(id, 'lease', list)).toBe(true);
    }
  );
  it.each(
    [['bad'], [ids[0], ids[0]], Array(257).fill(ids[0]), new Array(1)].map((list) => ({ list }))
  )('rejects invalid candidates before writes', async ({ list }) => {
    const f = fixture();
    await expect(f.store.initialize(id, 'lease', list)).rejects.toThrow();
    expect(f.updateOne).not.toHaveBeenCalled();
  });
  it('CAS saves yielded progress with full snapshot identity and lease', async () => {
    const f = fixture();
    expect(await f.store.save(id, 'new-lease', initial(), yielded(1, true))).toBe(true);
    const [filter, update] = f.updateOne.mock.calls[0];
    expect(filter).toMatchObject({
      _id: id,
      'expenseDelivery.token': 'new-lease',
      'expenseDelivery.pushSweep.snapshotId': initial().snapshotId,
      'expenseDelivery.pushSweep.revision': 0,
      'expenseDelivery.pushSweep.nextIndex': 0,
      'expenseDelivery.pushSweep.subscriptionIds': ids,
      'expenseDelivery.pushSweep.hadFailures': false,
      'expenseDelivery.pushSweep.status': 'running',
    });
    expect(update.$set['expenseDelivery.pushSweep']).toEqual({
      ...initial(),
      revision: 1,
      nextIndex: 1,
      hadFailures: true,
    });
  });
  it.each(['retry', 'exhausted'] as const)(
    'stores completed sweep status %s without completing queue',
    async (status) => {
      const f = fixture();
      await f.store.save(id, 'lease', initial(), { status, continuation: null });
      expect(f.updateOne.mock.calls[0][1]).toEqual({
        $set: {
          'expenseDelivery.pushSweep': {
            ...initial(),
            revision: 1,
            nextIndex: ids.length,
            hadFailures: status === 'retry',
            status,
          },
        },
      });
    }
  );
  it('returns false for stale CAS, lost lease or a competing initialization', async () => {
    const f = fixture();
    f.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await f.store.initialize(id, 'lease', ids)).toBe(false);
    expect(await f.store.save(id, 'lease', initial(), yielded())).toBe(false);
  });
  it.each(['stopped', 'disabled', 'capacity'] as const)(
    'does not persist %s as finished',
    async (status) => {
      const f = fixture();
      await expect(
        f.store.save(id, 'lease', initial(), { status, continuation: null })
      ).rejects.toThrow();
      expect(f.updateOne).not.toHaveBeenCalled();
    }
  );
  it.each([-1, 2, 0.5, NaN])('rejects invalid continuation index %s', async (index) => {
    const f = fixture();
    await expect(f.store.save(id, 'lease', initial(), yielded(index))).rejects.toThrow();
    expect(f.updateOne).not.toHaveBeenCalled();
  });
  it('rejects reordered candidate lists', async () => {
    const f = fixture();
    const result = yielded();
    result.continuation.subscriptionIds.reverse();
    await expect(f.store.save(id, 'lease', initial(), result)).rejects.toThrow(
      'candidates changed'
    );
  });
  it('rejects cursor regression and loss of prior failure state', async () => {
    const f = fixture();
    await expect(
      f.store.save(id, 'lease', { ...initial(), nextIndex: 1 }, yielded(0))
    ).rejects.toThrow('regressed');
    await expect(
      f.store.save(id, 'lease', { ...initial(), hadFailures: true }, yielded())
    ).rejects.toThrow('regressed');
    await expect(
      f.store.save(
        id,
        'lease',
        { ...initial(), hadFailures: true },
        { status: 'exhausted', continuation: null }
      )
    ).rejects.toThrow('regressed');
    expect(f.updateOne).not.toHaveBeenCalled();
  });
  it('rejects attempts to reset a finished sweep', async () => {
    const f = fixture();
    await expect(
      f.store.save(
        id,
        'lease',
        { ...initial(), status: 'retry', nextIndex: 2, hadFailures: true },
        yielded()
      )
    ).rejects.toThrow('already finished');
  });
  it('rejects corrupt stored state', async () => {
    const f = fixture();
    f.findOne.mockResolvedValue({
      expenseDelivery: { pushSweep: { ...initial(), nextIndex: 99 } },
    });
    await expect(f.store.read(id, 'lease')).rejects.toThrow();
  });
  it('rejects inconsistent result payloads', async () => {
    const f = fixture();
    await expect(
      f.store.save(id, 'lease', initial(), { status: 'yielded', continuation: null })
    ).rejects.toThrow();
    await expect(
      f.store.save(id, 'lease', initial(), {
        ...yielded(),
        status: 'retry',
      })
    ).rejects.toThrow();
  });
  it('propagates uncertain DB writes; caller must re-read before continuing', async () => {
    const f = fixture();
    f.updateOne.mockRejectedValue(new Error('timeout'));
    await expect(f.store.initialize(id, 'lease', ids)).rejects.toThrow('timeout');
    await expect(f.store.save(id, 'lease', initial(), yielded())).rejects.toThrow('timeout');
  });
});
