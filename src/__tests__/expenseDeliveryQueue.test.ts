import { describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import {
  createExpenseDeliveryQueue,
  initialExpenseDeliveryState,
  type ExpenseDeliveryRecord,
} from '@/lib/expenseDeliveryQueue';

describe('expense delivery queue guards', () => {
  it('creates independent embedded state without a database write', () => {
    const first = initialExpenseDeliveryState();
    const second = initialExpenseDeliveryState();
    expect(first).toEqual({
      status: 'pending',
      attempts: 0,
      availableAt: new Date(0),
      token: null,
    });
    first.availableAt.setTime(1000);
    expect(second.availableAt.getTime()).toBe(0);
  });

  it('does not connect, create indexes or enqueue on construction', () => {
    const collection = {} as mongo.Collection<ExpenseDeliveryRecord>;
    expect(createExpenseDeliveryQueue(collection)).toHaveProperty('claim');
  });

  it('rejects arbitrary error text before database access', async () => {
    const updateOne = vi.fn();
    const queue = createExpenseDeliveryQueue({
      updateOne,
    } as unknown as mongo.Collection<ExpenseDeliveryRecord>);
    await expect(
      queue.fail(new mongo.ObjectId(), 'token', 'secret endpoint' as 'worker_error')
    ).rejects.toThrow('Invalid delivery failure code');
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('propagates storage failures so a worker cannot mistake them for completion', async () => {
    const updateOne = vi.fn().mockRejectedValue(new Error('DB unavailable'));
    const queue = createExpenseDeliveryQueue({
      updateOne,
    } as unknown as mongo.Collection<ExpenseDeliveryRecord>);
    await expect(queue.complete(new mongo.ObjectId(), 'token')).rejects.toThrow('DB unavailable');
  });
});
