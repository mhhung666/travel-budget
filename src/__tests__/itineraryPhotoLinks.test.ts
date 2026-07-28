import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 行程日的變動如何影響相簿相片（PLAN-PHOTOS Phase 2）。
 *
 * 這裡守的是一條不變式：**「借」自行程日的座標必須跟著來源走**。
 * Phase 2 讓沒有 GPS 的相片可以借關聯行程日的座標（`location.source === 'itinerary'`），
 * 於是行程日被刪掉／換了地點時，那些借來的座標就必須跟著更新或消失——否則地圖上會留下
 * 沒有任何來源可解釋的釘子（Mongo 無 FK cascade，這種清理一律得自己來）。
 * 相片自己的 GPS（`'exif'`）與手動釘（`'manual'`）比整天共用的城市座標精確，任何情況都不可被覆蓋。
 */
const getSession = vi.fn();
const getTripMembership = vi.fn();
const dayFindOne = vi.fn();
const dayFind = vi.fn();
const dayFindOneAndUpdate = vi.fn();
const dayDeleteOne = vi.fn();
const dayBulkWrite = vi.fn();
const expenseUpdateMany = vi.fn();
const photoUpdateMany = vi.fn();
const tripFindById = vi.fn();
const rebindAutoPhotosToItinerary = vi.fn();

vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));

vi.mock('@/lib/storage', () => ({
  headObject: vi.fn(),
  deleteObjects: vi.fn().mockResolvedValue(undefined),
  presignGet: vi.fn().mockResolvedValue('https://signed.example/ticket'),
}));

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/lib/photoItinerary', () => ({
  rebindAutoPhotosToItinerary: (...args: unknown[]) => rebindAutoPhotosToItinerary(...args),
}));

vi.mock('@/models', () => ({
  ItineraryDay: {
    findOne: (...args: unknown[]) => dayFindOne(...args),
    find: (...args: unknown[]) => dayFind(...args),
    findOneAndUpdate: (...args: unknown[]) => dayFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => dayDeleteOne(...args),
    bulkWrite: (...args: unknown[]) => dayBulkWrite(...args),
  },
  Expense: {
    updateMany: (...args: unknown[]) => expenseUpdateMany(...args),
  },
  Photo: {
    updateMany: (...args: unknown[]) => photoUpdateMany(...args),
  },
  Trip: {
    findById: (...args: unknown[]) => tripFindById(...args),
  },
}));

import { deleteItineraryDay, updateItineraryDay } from '@/actions/itinerary.actions';

const ADMIN = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const DAY_ID = '507f1f77bcf86cd799439013';

/** ItineraryDay.findOne(...).select(...).lean() */
const chainSelectLean = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value) }),
});
/** ItineraryDay.find(...).sort(...).select(...).lean() */
const chainSortSelectLean = (value: unknown) => ({
  sort: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }),
});
/** ItineraryDay.findOneAndUpdate(...).lean() */
const chainLean = (value: unknown) => ({ lean: () => Promise.resolve(value) });

/** 一份 lean ItineraryDay doc（toDayDto 輸入形狀）。 */
const leanDay = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => DAY_ID },
  trip: { toString: () => TRIP_ID },
  dayNumber: 1,
  title: 'Tokyo',
  content: '',
  location: null,
  activities: [],
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  ...overrides,
});

/** 送給 Photo.updateMany 的呼叫（filter, update）配對。 */
const photoCalls = () => photoUpdateMany.mock.calls.map(([filter, update]) => ({ filter, update }));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: ADMIN });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'admin' });
  dayFindOne.mockReturnValue(chainSelectLean({ activities: [] }));
  dayDeleteOne.mockResolvedValue({ deletedCount: 1 });
  dayFind.mockReturnValue(chainSortSelectLean([]));
  expenseUpdateMany.mockResolvedValue({});
  photoUpdateMany.mockResolvedValue({});
  tripFindById.mockReturnValue(
    chainSelectLean({
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-03T00:00:00.000Z'),
    })
  );
  rebindAutoPhotosToItinerary.mockResolvedValue(undefined);
});

describe('deleteItineraryDay → 相片關聯清理', () => {
  it('unlinks the photos and reclaims only the coordinates borrowed from this day', async () => {
    const result = await deleteItineraryDay(TRIP_ID, DAY_ID);

    expect(result.success).toBe(true);
    const calls = photoCalls();
    expect(calls).toHaveLength(2);

    // 先收回借來的座標——這一步靠 itineraryDay 篩，若順序反了就篩不到任何相片
    expect(calls[0]).toEqual({
      filter: { trip: TRIP_ID, itineraryDay: DAY_ID, 'location.source': 'itinerary' },
      update: { $set: { location: null } },
    });
    // 再解除關聯，避免留下指向已刪文件的孤兒參照
    expect(calls[1]).toEqual({
      filter: { trip: TRIP_ID, itineraryDay: DAY_ID },
      update: { $set: { itineraryDay: null } },
    });
    expect(rebindAutoPhotosToItinerary).toHaveBeenCalledWith(
      TRIP_ID,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-03T00:00:00.000Z')
    );
  });

  it('never touches exif/manual locations (the source filter is what protects them)', async () => {
    await deleteItineraryDay(TRIP_ID, DAY_ID);

    const clearing = photoCalls().filter((c) => 'location' in (c.update.$set ?? {}));
    // 每一次清座標的操作都必須帶 source: 'itinerary' 條件
    for (const call of clearing) {
      expect(
        call.filter['location.source'] === 'itinerary' ||
          call.filter.$or?.some(
            (condition: Record<string, unknown>) => condition['location.source'] === 'itinerary'
          )
      ).toBe(true);
    }
  });

  it('does not clean photos up when the caller is not an admin', async () => {
    getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });

    const result = await deleteItineraryDay(TRIP_ID, DAY_ID);

    expect(result).toEqual({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
    expect(photoUpdateMany).not.toHaveBeenCalled();
  });
});

describe('updateItineraryDay → 借出座標的同步', () => {
  it('moves the borrowed coordinates when the day location changes', async () => {
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay()));

    const result = await updateItineraryDay(TRIP_ID, DAY_ID, {
      location: {
        name: 'Paris',
        display_name: 'Paris, France',
        lat: 48.85,
        lon: 2.35,
        country_code: 'fr',
      },
    });

    expect(result.success).toBe(true);
    expect(photoCalls()).toEqual([
      {
        filter: {
          trip: TRIP_ID,
          itineraryDay: DAY_ID,
          $or: [{ 'location.source': 'itinerary' }, { location: null }],
        },
        update: { $set: { location: { lat: 48.85, lon: 2.35, source: 'itinerary' } } },
      },
    ]);
  });

  it('reclaims the borrowed coordinates when the day location is cleared', async () => {
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay()));

    await updateItineraryDay(TRIP_ID, DAY_ID, { location: null });

    expect(photoCalls()).toEqual([
      {
        filter: { trip: TRIP_ID, itineraryDay: DAY_ID, 'location.source': 'itinerary' },
        update: { $set: { location: null } },
      },
    ]);
  });

  it('leaves photos alone when the update does not touch the location', async () => {
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay({ title: 'Osaka' })));

    await updateItineraryDay(TRIP_ID, DAY_ID, { title: 'Osaka' });

    expect(photoUpdateMany).not.toHaveBeenCalled();
  });
});
