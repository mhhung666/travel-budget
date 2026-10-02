import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { createExpensePushCheckpoint } from '@/lib/expensePushCheckpoint';
import type { ExpenseDeliveryRecord } from '@/lib/expenseDeliveryQueue';

describe('expense push checkpoints', () => {
  function setup() {
    const updateOne = vi.fn();
    const findOne = vi.fn();
    const store = createExpensePushCheckpoint({
      updateOne,
      findOne,
    } as unknown as mongo.Collection<ExpenseDeliveryRecord>);
    return { store, updateOne, findOne };
  }

  it.each(['bad.id', '$endpoint', 'A'.repeat(24), ''])(
    'rejects unsafe device key %s',
    async (key) => {
      const { store, updateOne } = setup();
      await expect(store.record(new mongo.ObjectId(), 'token', key, 'accepted')).rejects.toThrow(
        'Invalid subscription ID'
      );
      expect(updateOne).not.toHaveBeenCalled();
    }
  );

  it('rejects failed or arbitrary outcome text', async () => {
    const { store, updateOne } = setup();
    await expect(
      store.record(
        new mongo.ObjectId(),
        'token',
        new mongo.ObjectId().toHexString(),
        'failed' as 'accepted'
      )
    ).rejects.toThrow('Invalid push checkpoint');
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('distinguishes invalid lease from an empty checkpoint map', async () => {
    const { store, findOne } = setup();
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ expenseDelivery: {} });
    expect(await store.read(new mongo.ObjectId(), 'token')).toBeNull();
    expect(await store.read(new mongo.ObjectId(), 'token')).toEqual({});
  });

  it('propagates storage errors instead of reporting success', async () => {
    const { store, updateOne, findOne } = setup();
    updateOne.mockRejectedValue(new Error('storage unavailable'));
    findOne.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      store.record(new mongo.ObjectId(), 'token', new mongo.ObjectId().toHexString(), 'accepted')
    ).rejects.toThrow('storage unavailable');
    await expect(store.read(new mongo.ObjectId(), 'token')).rejects.toThrow('storage unavailable');
  });
});
