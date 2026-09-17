import { describe, expect, it } from 'vitest';
import { COLLECTIONS, up, down } from '../../migrations/20260917230000-drop-loyalty-collections.js';

function database(existing) {
  const collections = new Set(existing);
  const dropped = [];
  const db = {
    listCollections: ({ name }) => ({ hasNext: async () => collections.has(name) }),
    collection: (name) => ({
      drop: async () => {
        collections.delete(name);
        dropped.push(name);
      },
    }),
  };
  return { db, collections, dropped };
}

describe('drop loyalty collections migration', () => {
  it('drops both loyalty collections and leaves others alone', async () => {
    const { db, collections, dropped } = database([...COLLECTIONS, 'flightrecords']);
    await up(db);
    expect(dropped).toEqual(COLLECTIONS);
    expect([...collections]).toEqual(['flightrecords']);
  });

  it('is idempotent when collections are already gone', async () => {
    const { db, dropped } = database(['loyaltyentries']);
    await up(db);
    await up(db);
    expect(dropped).toEqual(['loyaltyentries']);
  });

  it('down is a no-op', async () => {
    await expect(down()).resolves.toBeUndefined();
  });
});
