// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { up, down } from '../../migrations/20260909120000-itinerary-day-revision.js';

it('backfills missing revisions without resetting existing revisions, and supports repeatable rollback', async () => {
  const rows = [{ _id: 'old' }, { _id: 'edited', revision: 7 }];
  const collection = vi.fn(() => ({
    updateMany: async (filter, update) => {
      for (const row of rows) {
        if (Object.hasOwn(row, 'revision') !== filter.revision.$exists) continue;
        if (update.$set) row.revision = update.$set.revision;
        if (update.$unset) delete row.revision;
      }
    },
  }));
  const db = { collection };
  await up(db);
  await up(db);
  expect(rows).toEqual([
    { _id: 'old', revision: 0 },
    { _id: 'edited', revision: 7 },
  ]);
  await down(db);
  await down(db);
  expect(rows).toEqual([{ _id: 'old' }, { _id: 'edited' }]);
  await up(db);
  expect(rows.every((row) => row.revision === 0)).toBe(true);
  expect(collection.mock.calls.every(([name]) => name === 'itinerarydays')).toBe(true);
});
