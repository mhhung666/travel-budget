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

it('backfills only missing activity revisions and reversibly handles mixed and empty days', async () => {
  const migration = await import('../../migrations/20260909130000-itinerary-activity-revision.js');
  const rows = [
    { activities: [{ title: 'old' }, { title: 'edited', revision: 7 }] },
    { activities: [] },
    {},
  ];
  const updateMany = vi.fn(async (filter, update, options) => {
    if (update.$set) {
      expect(filter).toEqual({ activities: { $elemMatch: { revision: { $exists: false } } } });
      expect(options).toEqual({ arrayFilters: [{ 'activity.revision': { $exists: false } }] });
      for (const row of rows)
        for (const activity of row.activities ?? []) {
          if (!Object.hasOwn(activity, 'revision'))
            activity.revision = update.$set['activities.$[activity].revision'];
        }
    } else {
      expect(filter).toEqual({ 'activities.revision': { $exists: true } });
      expect(update).toEqual({ $unset: { 'activities.$[].revision': '' } });
      for (const row of rows) for (const activity of row.activities ?? []) delete activity.revision;
    }
  });
  const collection = vi.fn(() => ({ updateMany }));
  const db = { collection };
  await migration.up(db);
  await migration.up(db);
  expect(rows).toEqual([
    {
      activities: [
        { title: 'old', revision: 0 },
        { title: 'edited', revision: 7 },
      ],
    },
    { activities: [] },
    {},
  ]);
  await migration.down(db);
  await migration.down(db);
  expect(rows).toEqual([
    { activities: [{ title: 'old' }, { title: 'edited' }] },
    { activities: [] },
    {},
  ]);
  expect(collection.mock.calls.every(([name]) => name === 'itinerarydays')).toBe(true);
});
