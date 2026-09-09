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

import {
  createItineraryDay,
  deleteItineraryDay,
  updateItineraryDay,
  mutateItineraryActivity,
} from '@/actions/itinerary.actions';

const ADMIN = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const EXPECTED_UPDATED_AT = '2026-07-01T00:00:00.000Z';
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
  revision: 0,
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
  dayFindOne.mockReturnValue(chainSelectLean(leanDay()));
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
  it('increments the revision of each renumbered day in the same scoped write', async () => {
    dayFind.mockReturnValue(chainSortSelectLean([{ _id: 'remaining', dayNumber: 2 }]));
    expect((await deleteItineraryDay(TRIP_ID, DAY_ID)).success).toBe(true);
    expect(dayBulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: { _id: 'remaining', trip: TRIP_ID },
            update: { $set: { dayNumber: 1 }, $inc: { revision: 1 } },
          },
        },
      ],
      { ordered: true }
    );
  });

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
      expected_revision: 0,
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

    await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      location: null,
    });

    expect(photoCalls()).toEqual([
      {
        filter: { trip: TRIP_ID, itineraryDay: DAY_ID, 'location.source': 'itinerary' },
        update: { $set: { location: null } },
      },
    ]);
  });

  it('leaves photos alone when the update does not touch the location', async () => {
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay({ title: 'Osaka' })));

    await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      title: 'Osaka',
    });

    expect(photoUpdateMany).not.toHaveBeenCalled();
  });
});

describe('updateItineraryDay → stale draft protection', () => {
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, NaN, Infinity])(
    'rejects invalid revision %s before database access',
    async (expected_revision) => {
      expect(
        await updateItineraryDay(TRIP_ID, DAY_ID, { expected_revision, title: 'X' })
      ).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(dayFindOne).not.toHaveBeenCalled();
    }
  );

  it('rejects a timestamp-only legacy client', async () => {
    expect(
      // @ts-expect-error old client contract must fail closed
      await updateItineraryDay(TRIP_ID, DAY_ID, { expected_updated_at: EXPECTED_UPDATED_AT })
    ).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(dayFindOne).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid snapshot tokens without reading or writing the day', async () => {
    // Old deployed clients must fail closed instead of silently overwriting new data.
    // @ts-expect-error deliberately exercise an old client payload
    expect(await updateItineraryDay(TRIP_ID, DAY_ID, { title: 'Old client' })).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(
      await updateItineraryDay(TRIP_ID, DAY_ID, { expected_revision: -1, title: 'X' })
    ).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(dayFindOne).not.toHaveBeenCalled();
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([null, { tripId: TRIP_ID, role: 'member' }])(
    'preserves membership and admin authorization: %s',
    async (membership) => {
      getTripMembership.mockResolvedValue(membership);
      expect(
        await updateItineraryDay(TRIP_ID, DAY_ID, {
          expected_revision: 0,
          title: 'X',
        })
      ).toMatchObject({ code: membership ? 'FORBIDDEN' : 'NOT_FOUND' });
      expect(dayFindOne).not.toHaveBeenCalled();
      expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    }
  );

  it('distinguishes a missing day from a stale draft', async () => {
    dayFindOne.mockReturnValue(chainSelectLean(null));
    expect(
      await updateItineraryDay(TRIP_ID, DAY_ID, {
        expected_revision: 0,
        title: 'X',
      })
    ).toMatchObject({ code: 'NOT_FOUND' });
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a stale draft before attachment validation or any side effect', async () => {
    const { headObject, deleteObjects } = await import('@/lib/storage');
    dayFindOne.mockReturnValue(chainSelectLean(leanDay({ revision: 1 })));
    const result = await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      activities: [],
      location: null,
    });
    expect(result).toMatchObject({ code: 'CONFLICT' });
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    expect(headObject).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(photoUpdateMany).not.toHaveBeenCalled();
  });

  it('does not delete removed ticket blobs or update photos when the write loses a race', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    dayFindOne.mockReturnValue(
      chainSelectLean(
        leanDay({
          activities: [
            {
              _id: '507f1f77bcf86cd799439015',
              attachments: [{ key: 'kept-by-winner', uploadedBy: ADMIN }],
            },
          ],
        })
      )
    );
    dayFindOneAndUpdate.mockReturnValue(chainLean(null));
    expect(
      await updateItineraryDay(TRIP_ID, DAY_ID, {
        expected_revision: 0,
        activities: [],
        location: null,
      })
    ).toMatchObject({ code: 'CONFLICT' });
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(photoUpdateMany).not.toHaveBeenCalled();
  });

  it('allows only one of two saves from the same snapshot, even with a frozen millisecond', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date(EXPECTED_UPDATED_AT).getTime());
    try {
      let stored = leanDay();
      // Both action reads receive the original snapshot before either atomic write.
      dayFindOne.mockReturnValue(chainSelectLean(leanDay()));
      dayFindOneAndUpdate.mockImplementation((filter, update, options) => ({
        lean: async () => {
          expect(filter).toMatchObject({ _id: DAY_ID, trip: TRIP_ID });
          expect(options.timestamps).toBe(false);
          if (filter.revision !== stored.revision) return null;
          stored = { ...stored, ...update.$set, revision: stored.revision + update.$inc.revision };
          return stored;
        },
      }));
      const results = await Promise.all(
        ['First draft', 'Second draft'].map((title) =>
          updateItineraryDay(TRIP_ID, DAY_ID, {
            expected_revision: 0,
            title,
          })
        )
      );
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(
        results.filter((result) => !result.success && result.code === 'CONFLICT')
      ).toHaveLength(1);
      expect(stored.title).toBe('First draft');
      expect(stored.revision).toBe(1);
      expect(stored.updatedAt.getTime()).toBe(new Date(EXPECTED_UPDATED_AT).getTime() + 1);
      const winner = results[0];
      expect(winner.success && winner.data.updated_at).toBe(stored.updatedAt.toISOString());
    } finally {
      clock.mockRestore();
    }
  });

  it('cleans up removed tickets only after a successful guarded write', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    dayFindOne.mockReturnValue(
      chainSelectLean(
        leanDay({
          activities: [
            {
              _id: '507f1f77bcf86cd799439015',
              attachments: [{ key: 'removed', uploadedBy: ADMIN }],
            },
          ],
        })
      )
    );
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay()));
    expect(
      await updateItineraryDay(TRIP_ID, DAY_ID, {
        expected_revision: 0,
        activities: [],
      })
    ).toMatchObject({ success: true });
    expect(deleteObjects).toHaveBeenCalledWith('receipts', ['removed']);
  });
});

describe('updateItineraryDay activity identity', () => {
  const firstId = '507f1f77bcf86cd799439015';
  const secondId = '507f1f77bcf86cd799439016';
  const payload = (id: string | null, title = 'Activity') => ({
    id,
    title,
    type: 'other' as const,
    time: null,
    end_time: null,
    location_name: '',
    note: '',
    confirmation_code: '',
  });

  it('preserves reordered/edited IDs and leaves new IDs to Mongoose', async () => {
    dayFindOne.mockReturnValue(
      chainSelectLean(
        leanDay({
          activities: [{ _id: firstId }, { _id: secondId }],
        })
      )
    );
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay()));
    const result = await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      activities: [payload(secondId, 'Edited'), payload(firstId), payload(null, 'New')],
    });
    expect(result.success).toBe(true);
    const stored = dayFindOneAndUpdate.mock.calls[0][1].$set.activities;
    expect(stored[0]).toMatchObject({ _id: secondId, title: 'Edited' });
    expect(stored[1]).toMatchObject({ _id: firstId });
    expect(stored[2]).not.toHaveProperty('_id');
  });

  it.each([
    ['duplicate', [payload(firstId), payload(firstId)]],
    ['foreign day', [payload(secondId)]],
    ['malformed', [payload('bad-id')]],
    ['omitted (old client)', [{ ...payload(null), id: undefined }]],
  ])('rejects %s IDs before attachment validation or writes', async (_label, activities) => {
    const { headObject, deleteObjects } = await import('@/lib/storage');
    dayFindOne.mockReturnValue(chainSelectLean(leanDay({ activities: [{ _id: firstId }] })));
    const result = await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      activities: activities as Parameters<typeof updateItineraryDay>[2]['activities'],
    });
    expect(result).toEqual({ success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' });
    expect(headObject).not.toHaveBeenCalled();
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(photoUpdateMany).not.toHaveBeenCalled();
  });

  it('removes one activity without changing the survivor identity', async () => {
    dayFindOne.mockReturnValue(
      chainSelectLean(leanDay({ activities: [{ _id: firstId }, { _id: secondId }] }))
    );
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay()));
    const result = await updateItineraryDay(TRIP_ID, DAY_ID, {
      expected_revision: 0,
      activities: [payload(secondId)],
    });
    expect(result.success).toBe(true);
    expect(dayFindOneAndUpdate.mock.calls[0][1].$set.activities).toEqual([
      expect.objectContaining({ _id: secondId }),
    ]);
  });
});

describe('mutateItineraryActivity', () => {
  const activityId = '507f1f77bcf86cd799439015';
  const siblingId = '507f1f77bcf86cd799439016';
  const ticket = (key: string) => ({
    key,
    contentType: 'application/pdf',
    size: 100,
    uploadedBy: ADMIN,
    uploadedAt: new Date(EXPECTED_UPDATED_AT),
  });
  const target = {
    _id: activityId,
    title: 'Original',
    type: 'other',
    attachments: [ticket('removed'), ticket('shared')],
  };
  const sibling = {
    _id: siblingId,
    title: 'Sibling',
    type: 'other',
    attachments: [ticket('shared')],
  };
  const activity = {
    title: 'Edited',
    type: 'other' as const,
    time: null,
    end_time: null,
    location_name: '',
    note: '',
    confirmation_code: '',
  };
  const input = {
    operation: 'update' as const,
    activity_id: activityId,
    activity,
    expected_revision: 0,
  };

  beforeEach(() => {
    dayFindOne.mockReturnValue(chainSelectLean(leanDay({ activities: [target, sibling] })));
    dayFindOneAndUpdate.mockReturnValue(
      chainLean(leanDay({ activities: [{ ...target, ...activity, attachments: [] }, sibling] }))
    );
  });

  it.each([15, 16])(
    'rejects appending to a day with %i activities before checking tickets',
    async (count) => {
      const { headObject } = await import('@/lib/storage');
      dayFindOne.mockReturnValue(
        chainSelectLean(leanDay({ activities: Array.from({ length: count }, () => target) }))
      );
      const result = await mutateItineraryActivity(TRIP_ID, DAY_ID, {
        operation: 'add',
        activity,
        expected_revision: 0,
      });
      expect(result).toMatchObject({ code: 'ACTIVITY_LIMIT' });
      expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
      expect(headObject).not.toHaveBeenCalled();
    }
  );

  it.each(['update', 'delete'] as const)(
    'allows %s on an existing over-limit day',
    async (operation) => {
      dayFindOne.mockReturnValue(
        chainSelectLean(leanDay({ activities: Array.from({ length: 16 }, () => target) }))
      );
      expect(
        (await mutateItineraryActivity(TRIP_ID, DAY_ID, { ...input, operation })).success
      ).toBe(true);
      expect(dayFindOneAndUpdate.mock.calls[0][0]).not.toHaveProperty('$expr');
    }
  );

  it('guards the last available slot in the same write as the append', async () => {
    dayFindOne.mockReturnValue(
      chainSelectLean(leanDay({ activities: Array.from({ length: 14 }, () => target) }))
    );
    expect(
      (
        await mutateItineraryActivity(TRIP_ID, DAY_ID, {
          operation: 'add',
          activity,
          expected_revision: 0,
        })
      ).success
    ).toBe(true);
    expect(dayFindOneAndUpdate.mock.calls[0][0].$expr).toEqual({
      $lte: [{ $size: { $ifNull: ['$activities', []] } }, 14],
    });
  });

  it('rejects oversized create and full-array updates before storage or database work', async () => {
    const { headObject } = await import('@/lib/storage');
    const activities = Array.from({ length: 16 }, () => ({ ...activity, id: null }));
    expect(await createItineraryDay(TRIP_ID, { title: 'Day', activities })).toMatchObject({
      code: 'ACTIVITY_LIMIT',
    });
    expect(
      await updateItineraryDay(TRIP_ID, DAY_ID, {
        expected_revision: 0,
        activities,
      })
    ).toMatchObject({ code: 'ACTIVITY_LIMIT' });
    expect(dayFindOne).not.toHaveBeenCalled();
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    expect(headObject).not.toHaveBeenCalled();
  });

  it('updates only the matched activity and cleans only unreferenced target tickets', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    expect((await mutateItineraryActivity('tripcode', DAY_ID, input)).success).toBe(true);
    expect(getTripMembership).toHaveBeenCalledWith(ADMIN, 'tripcode');
    const [filter, update, options] = dayFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: DAY_ID,
      trip: TRIP_ID,
      revision: 0,
      'activities._id': activityId,
    });
    expect(update.$inc).toEqual({ revision: 1 });
    expect(update.$set['activities.$']).toMatchObject({ _id: activityId, title: 'Edited' });
    expect(update.$set).not.toHaveProperty('activities');
    expect(options).toEqual({ new: true, timestamps: false });
    expect(deleteObjects).toHaveBeenCalledWith('receipts', ['removed']);
    expect(photoUpdateMany).not.toHaveBeenCalled();
  });

  it('appends only the new activity with a server-generated identity', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    const result = await mutateItineraryActivity(TRIP_ID, DAY_ID, {
      operation: 'add',
      activity,
      expected_revision: 0,
    });
    expect(result.success).toBe(true);
    const [, update] = dayFindOneAndUpdate.mock.calls[0];
    expect(update.$push.activities).toMatchObject({ title: 'Edited' });
    expect(update.$push.activities).not.toHaveProperty('_id');
    expect(Object.keys(update.$set)).toEqual(['updatedAt']);
    expect(update.$inc).toEqual({ revision: 1 });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it('pulls only the requested activity and retains tickets shared with a sibling', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    dayFindOneAndUpdate.mockReturnValue(chainLean(leanDay({ activities: [sibling] })));
    expect(
      (
        await mutateItineraryActivity(TRIP_ID, DAY_ID, {
          operation: 'delete',
          activity_id: activityId,
          expected_revision: 0,
        })
      ).success
    ).toBe(true);
    const [, update] = dayFindOneAndUpdate.mock.calls[0];
    expect(update.$pull).toEqual({ activities: { _id: activityId } });
    expect(Object.keys(update.$set)).toEqual(['updatedAt']);
    expect(update.$inc).toEqual({ revision: 1 });
    expect(deleteObjects).toHaveBeenCalledWith('receipts', ['removed']);
  });

  it('preserves existing ticket metadata without HEAD requests', async () => {
    const { headObject } = await import('@/lib/storage');
    await mutateItineraryActivity(TRIP_ID, DAY_ID, {
      ...input,
      activity: {
        ...activity,
        attachments: [{ key: 'shared', content_type: 'application/pdf', size: 100 }],
      },
    });
    expect(dayFindOneAndUpdate.mock.calls[0][1].$set['activities.$'].attachments).toEqual([
      ticket('shared'),
    ]);
    expect(headObject).not.toHaveBeenCalled();
  });

  it('rejects invalid new ticket references before writing', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    const result = await mutateItineraryActivity(TRIP_ID, DAY_ID, {
      ...input,
      activity: {
        ...activity,
        attachments: [{ key: 'outside-trip', content_type: 'application/pdf', size: 100 }],
      },
    });
    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it.each(['add', 'update', 'delete'] as const)(
    'rejects stale %s without writing or deleting tickets',
    async (operation) => {
      const { deleteObjects, headObject } = await import('@/lib/storage');
      dayFindOne.mockReturnValue(chainSelectLean(leanDay({ revision: 1 })));
      const result = await mutateItineraryActivity(TRIP_ID, DAY_ID, { ...input, operation });
      expect(result).toMatchObject({ success: false, code: 'CONFLICT' });
      expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
      expect(deleteObjects).not.toHaveBeenCalled();
      expect(headObject).not.toHaveBeenCalled();
    }
  );

  it('does not clean tickets when the conditional write loses a race', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    dayFindOneAndUpdate.mockReturnValue(chainLean(null));
    expect(await mutateItineraryActivity(TRIP_ID, DAY_ID, input)).toMatchObject({
      success: false,
      code: 'CONFLICT',
    });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it.each([null, { tripId: TRIP_ID, role: 'member' }])(
    'requires trip admin membership',
    async (membership) => {
      getTripMembership.mockResolvedValue(membership);
      expect(await mutateItineraryActivity(TRIP_ID, DAY_ID, input)).toMatchObject({
        success: false,
        code: membership ? 'FORBIDDEN' : 'NOT_FOUND',
      });
      expect(dayFindOne).not.toHaveBeenCalled();
    }
  );

  it.each([null, leanDay({ activities: [sibling] })])(
    'rejects missing days or target activities',
    async (current) => {
      dayFindOne.mockReturnValue(chainSelectLean(current));
      expect(await mutateItineraryActivity(TRIP_ID, DAY_ID, input)).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
      });
      expect(dayFindOneAndUpdate).not.toHaveBeenCalled();
    }
  );

  it('requires a valid snapshot and target ID', async () => {
    for (const invalid of [
      { ...input, expected_revision: -1 },
      { ...input, activity_id: 'bad' },
    ]) {
      expect(await mutateItineraryActivity(TRIP_ID, DAY_ID, invalid)).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
    }
    expect(dayFindOne).not.toHaveBeenCalled();
  });
  it('validates new uploads using server metadata and ignores client activity identity', async () => {
    const { headObject } = await import('@/lib/storage');
    const key = `itinerary/${TRIP_ID}/new.pdf`;
    vi.mocked(headObject).mockResolvedValueOnce({ size: 321, contentType: 'application/pdf' });
    const submitted = {
      ...activity,
      id: siblingId,
      attachments: [{ key, content_type: 'application/pdf', size: 1 }],
    };
    expect(
      (await mutateItineraryActivity(TRIP_ID, DAY_ID, { ...input, activity: submitted })).success
    ).toBe(true);
    expect(headObject).toHaveBeenCalledWith('receipts', key);
    expect(dayFindOneAndUpdate.mock.calls[0][1].$set['activities.$']).toMatchObject({
      _id: activityId,
      attachments: [{ key, size: 321, contentType: 'application/pdf', uploadedBy: ADMIN }],
    });
  });

  it('keeps a successful save successful when ticket cleanup fails', async () => {
    const { deleteObjects } = await import('@/lib/storage');
    vi.mocked(deleteObjects).mockRejectedValueOnce(new Error('storage unavailable'));
    expect((await mutateItineraryActivity(TRIP_ID, DAY_ID, input)).success).toBe(true);
  });

  it('allows only one append per snapshot in the same millisecond', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date(EXPECTED_UPDATED_AT).getTime());
    try {
      let stored = leanDay();
      dayFindOne.mockReturnValue(chainSelectLean(leanDay()));
      dayFindOneAndUpdate.mockImplementation((filter, update) => ({
        lean: async () => {
          if (filter.revision !== stored.revision) return null;
          stored = {
            ...stored,
            updatedAt: update.$set.updatedAt,
            revision: stored.revision + update.$inc.revision,
          };
          return stored;
        },
      }));
      const results = await Promise.all(
        [1, 2].map(() =>
          mutateItineraryActivity(TRIP_ID, DAY_ID, {
            operation: 'add',
            activity,
            expected_revision: 0,
          })
        )
      );
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(
        results.filter((result) => !result.success && result.code === 'CONFLICT')
      ).toHaveLength(1);
      expect(stored.updatedAt.getTime()).toBe(new Date(EXPECTED_UPDATED_AT).getTime() + 1);
    } finally {
      clock.mockRestore();
    }
  });
});
