import { describe, expect, it, vi } from 'vitest';
import type { mongo } from 'mongoose';
import { createExpenseEventStore, EXPENSE_EVENT_INDEXES } from '@/lib/expenseEventStore';

describe('expense event index prerequisites', () => {
  it.each([
    { unique: false },
    { sparse: true },
    { hidden: true },
    { expireAfterSeconds: 60 },
    { key: { user: 1, deliveryEventKey: 1 } },
    { partialFilterExpression: { deliveryEventKey: { $exists: true } } },
    { collation: { locale: 'en', strength: 2 } },
  ])('refuses an incompatible index (%s) without writing', async (change) => {
    const collection = vi.fn((name: string) => ({
      listIndexes: () => ({
        toArray: async () =>
          EXPENSE_EVENT_INDEXES.filter((index) => index.collection === name).map((index) => ({
            ...index,
            ...change,
          })),
      }),
    }));
    await expect(createExpenseEventStore({ collection } as unknown as mongo.Db)).rejects.toThrow(
      'Required expense event index'
    );
  });
});
