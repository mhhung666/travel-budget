// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { up, down } from '../../migrations/20260907170000-expense-delivery-indexes.js';
import { EXPENSE_DELIVERY_INDEX } from '../lib/expenseDeliveryQueue';
import { EXPENSE_EVENT_INDEXES } from '../lib/expenseEventStore';

function setup(indexes = []) {
  const createIndex = vi.fn();
  const collection = vi.fn(() => ({
    listIndexes: () => ({ toArray: async () => indexes }),
    createIndex,
  }));
  const command = vi.fn().mockResolvedValue({ setName: 'rs' });
  return { db: { collection, admin: () => ({ command }) }, createIndex, command };
}
describe('expense delivery additive migration', () => {
  it('creates exactly the queue, recipient dedupe, activity dedupe and candidate indexes', async () => {
    const { db, createIndex } = setup();
    await up(db);
    expect(createIndex).toHaveBeenCalledTimes(4);
    expect(createIndex).toHaveBeenCalledWith(EXPENSE_DELIVERY_INDEX.key, {
      name: EXPENSE_DELIVERY_INDEX.name,
      collation: { locale: 'simple' },
    });
    for (const { collection: _collection, key, ...options } of EXPENSE_EVENT_INDEXES)
      expect(createIndex).toHaveBeenCalledWith(key, {
        ...options,
        collation: { locale: 'simple' },
      });
  });
  it('does not rebuild identical existing indexes', async () => {
    const { db, createIndex } = setup([
      EXPENSE_DELIVERY_INDEX,
      ...EXPENSE_EVENT_INDEXES,
      { name: 'expense_push_candidates', key: { user: 1, _id: 1 } },
    ]);
    await up(db);
    expect(createIndex).not.toHaveBeenCalled();
  });
  it('rejects standalone databases before DDL', async () => {
    const { db, command, createIndex } = setup();
    command.mockResolvedValue({});
    await expect(up(db)).rejects.toThrow('transactions');
    expect(createIndex).not.toHaveBeenCalled();
  });
  it('preflights all definitions before installing any missing index', async () => {
    const { db, createIndex } = setup([{ ...EXPENSE_EVENT_INDEXES[1], unique: false }]);
    await expect(up(db)).rejects.toThrow('Incompatible');
    expect(createIndex).not.toHaveBeenCalled();
  });
  it('never removes dedupe indexes on rollback', async () => {
    await expect(down()).rejects.toThrow('Forward-only');
  });
});
