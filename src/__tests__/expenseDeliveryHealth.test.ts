import { describe, expect, it, vi } from 'vitest';
import type { mongo } from 'mongoose';
import { expenseDeliveryHealth } from '@/lib/expenseDeliveryHealth';
import { expensePushDisplayOptions } from '@/lib/expensePushDisplay';
describe('safe expense delivery inspection', () => {
  it('returns only counts and oldest pending creation time with bounded primary reads', async () => {
    const aggregate = vi.fn().mockReturnValue({
      toArray: async () => [
        { _id: 'pending', count: 3, oldest: new Date('2026-09-07') },
        { _id: 'dead', count: 1, oldest: new Date(), secret: 'not returned' },
      ],
    });
    const db = { collection: () => ({ aggregate }) } as unknown as mongo.Db;
    expect(await expenseDeliveryHealth(db)).toEqual({
      counts: { pending: 3, leased: 0, done: 0, dead: 1 },
      oldestPendingAt: '2026-09-07T00:00:00.000Z',
    });
    expect(aggregate).toHaveBeenCalledWith(expect.any(Array), {
      readPreference: 'primary',
      maxTimeMS: 2000,
      timeoutMS: 2000,
    });
  });
  it('does not report a database error as zero pending jobs', async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            throw new Error('failed');
          },
        }),
      }),
    } as unknown as mongo.Db;
    await expect(expenseDeliveryHealth(db)).rejects.toThrow('failed');
  });
});
describe('expense retry display identity', () => {
  it('reuses the same non-alerting notification tag for a retried event', () => {
    const tag = 'expense_added:000000000000000000000001';
    expect(expensePushDisplayOptions(tag)).toEqual({ tag, renotify: false });
    expect(expensePushDisplayOptions(tag)).toEqual(expensePushDisplayOptions(tag));
    expect(expensePushDisplayOptions('expense_added:000000000000000000000002')).not.toEqual(
      expensePushDisplayOptions(tag)
    );
  });
  it.each([undefined, null, '', 'arbitrary', 'expense_added:bad', 123])(
    'ignores invalid or legacy tag %s',
    (tag) => {
      expect(expensePushDisplayOptions(tag)).toEqual({});
    }
  );
});
