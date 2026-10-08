import { beforeEach, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import { updateTripForActor } from '@/lib/tripManagement';
const h = vi.hoisted(() => ({ rebind: vi.fn(), update: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/tripWriteTransaction', () => ({
  withTripWriteInDatabase: (
    _db: unknown,
    _trip: string,
    _actor: string,
    write: (session: unknown) => unknown
  ) => write(undefined),
}));
vi.mock('@/lib/photoItineraryTransaction', () => ({ rebindAutoPhotosInTransaction: h.rebind }));
const tripId = '507f1f77bcf86cd799439011',
  actor = '507f191e810c19729de860ea';
const db = { collection: () => ({ findOne: h.find, updateOne: h.update }) } as unknown as mongo.Db;
beforeEach(() => {
  vi.clearAllMocks();
  h.find.mockResolvedValue({
    _id: new mongo.ObjectId(tripId),
    name: 'Europe',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-10'),
    members: [],
  });
});
it('shared trip writer rebinds auto photos using the updated range', async () => {
  const updated = await updateTripForActor(db, actor, tripId, { start_date: '2026-07-02' });
  expect(h.rebind).toHaveBeenCalledWith(
    db,
    undefined,
    new mongo.ObjectId(tripId),
    updated,
    expect.any(Date)
  );
  expect(updated.startDate?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
});
it('editing only the name does not recompute photo associations', async () => {
  await updateTripForActor(db, actor, tripId, { name: ' Europe 2026 ' });
  expect(h.rebind).not.toHaveBeenCalled();
  expect(h.update).toHaveBeenCalledWith(
    { _id: new mongo.ObjectId(tripId) },
    { $set: { name: 'Europe 2026' } },
    { session: undefined }
  );
});
it('partial invalid range rejects before changing data or rebinds', async () => {
  await expect(
    updateTripForActor(db, actor, tripId, { start_date: '2026-07-11' })
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(h.update).not.toHaveBeenCalled();
  expect(h.rebind).not.toHaveBeenCalled();
});
