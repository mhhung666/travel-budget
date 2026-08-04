import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTripMembership: vi.fn(),
  tripFindById: vi.fn(),
  dayFindOne: vi.fn(),
  dayFindOneAndUpdate: vi.fn(),
  dayCreate: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  logActivity: vi.fn(),
  rebindAutoPhotosToItinerary: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.getTripMembership }));
vi.mock('@/lib/logger', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/activity', () => ({ logActivity: mocks.logActivity }));
vi.mock('@/lib/photoItinerary', () => ({
  rebindAutoPhotosToItinerary: mocks.rebindAutoPhotosToItinerary,
}));
vi.mock('@/models', () => ({
  Trip: { findById: mocks.tripFindById },
  ItineraryDay: {
    findOne: mocks.dayFindOne,
    findOneAndUpdate: mocks.dayFindOneAndUpdate,
    create: mocks.dayCreate,
  },
}));

import { confirmItineraryImport } from '@/actions/itineraryImport.actions';

const USER_ID = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const OPERATION_ID = '4a98aa4e-630b-4a1a-bd86-b52fe48fe560';

type StoredDay = {
  _id: string;
  trip: string;
  dayNumber: number;
  title: string;
  content: string;
  activities: Array<Record<string, unknown>>;
  appliedImportKeys: string[];
};

let storedDays: StoredDay[];

function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function findStored(query: Record<string, unknown>): StoredDay | null {
  return (
    storedDays.find(
      (day) =>
        (query._id === undefined || day._id === query._id) &&
        (query.trip === undefined || day.trip === query.trip) &&
        (query.dayNumber === undefined || day.dayNumber === query.dayNumber)
    ) ?? null
  );
}

function draft(days: Array<Record<string, unknown>>) {
  return { operationId: OPERATION_ID, draft: { sourceSummary: '', days, warnings: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  storedDays = [];
  mocks.getSession.mockResolvedValue({ userId: USER_ID });
  mocks.getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'admin' });
  mocks.logActivity.mockResolvedValue(undefined);
  mocks.rebindAutoPhotosToItinerary.mockResolvedValue(undefined);
  mocks.tripFindById.mockReturnValue(
    selectLean({
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-05T00:00:00.000Z'),
    })
  );
  mocks.dayFindOne.mockImplementation((query: Record<string, unknown>) =>
    selectLean(findStored(query))
  );
  mocks.dayFindOneAndUpdate.mockImplementation(
    (query: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => ({
      lean: async () => {
        const day = findStored(query);
        if (!day) return null;
        const key = (update.$addToSet as { appliedImportKeys: string }).appliedImportKeys;
        if (day.appliedImportKeys.includes(key)) return null;
        const maximumExisting = (query.$expr as { $lte: [unknown, number] }).$lte[1];
        if (day.activities.length > maximumExisting) return null;
        const activities = (
          update.$push as { activities: { $each: Array<Record<string, unknown>> } }
        ).activities.$each;
        day.activities.push(...activities);
        day.appliedImportKeys.push(key);
        return day;
      },
    })
  );
  mocks.dayCreate.mockImplementation(async (input: Omit<StoredDay, '_id'>) => {
    if (storedDays.some((day) => day.trip === input.trip && day.dayNumber === input.dayNumber)) {
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
    const created = { ...input, _id: `day-${storedDays.length + 1}` };
    storedDays.push(created);
    return created;
  });
});

describe('confirmItineraryImport', () => {
  it('rechecks admin permission before any write', async () => {
    mocks.getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });

    const result = await confirmItineraryImport(
      TRIP_ID,
      draft([{ date: '2026-09-01', title: 'Day 1', activities: [] }])
    );

    expect(result).toEqual({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
    expect(mocks.dayCreate).not.toHaveBeenCalled();
    expect(mocks.dayFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('creates the requested day number and preserves text-only locations', async () => {
    const result = await confirmItineraryImport(
      TRIP_ID,
      draft([
        {
          date: '2026-09-03',
          title: 'Kyoto',
          activities: [
            {
              time: '09:00',
              title: '清水寺',
              type: 'sightseeing',
              locationName: '東山區',
              confirmationCode: 'PRIVATE-CODE',
            },
          ],
        },
      ])
    );

    expect(result).toMatchObject({
      success: true,
      data: { summary: { successfulDays: 1, addedActivities: 1, failedDays: 0 } },
    });
    expect(storedDays[0]).toMatchObject({
      dayNumber: 3,
      title: 'Kyoto',
      activities: [
        {
          title: '清水寺',
          location: null,
          locationName: '東山區',
          confirmationCode: 'PRIVATE-CODE',
        },
      ],
    });
    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain('PRIVATE-CODE');
    expect(mocks.logActivity).toHaveBeenCalledWith({
      tripId: TRIP_ID,
      actorId: USER_ID,
      type: 'itinerary_imported',
      meta: { days: 1, activities: 1 },
    });
  });

  it('appends atomically and treats an identical retry as already imported', async () => {
    storedDays.push({
      _id: 'existing-day',
      trip: TRIP_ID,
      dayNumber: 1,
      title: 'Existing title',
      content: 'Existing content',
      activities: [{ title: 'Existing activity' }],
      appliedImportKeys: [],
    });
    const input = draft([
      {
        date: '2026-09-01',
        title: 'Must not overwrite',
        content: 'Must not overwrite',
        activities: [{ title: 'Museum', type: 'sightseeing' }],
      },
    ]);

    const first = await confirmItineraryImport(TRIP_ID, input);
    const retry = await confirmItineraryImport(TRIP_ID, input);

    expect(first).toMatchObject({ success: true, data: { summary: { addedActivities: 1 } } });
    expect(retry).toMatchObject({
      success: true,
      data: { summary: { alreadyImportedDays: 1, addedActivities: 0 } },
    });
    expect(storedDays[0].title).toBe('Existing title');
    expect(storedDays[0].content).toBe('Existing content');
    expect(storedDays[0].activities).toHaveLength(2);
  });

  it('deduplicates two concurrent confirmations of a new date', async () => {
    const input = draft([
      {
        date: '2026-09-01',
        title: 'Day 1',
        activities: [{ title: 'Museum', type: 'sightseeing' }],
      },
    ]);

    const results = await Promise.all([
      confirmItineraryImport(TRIP_ID, input),
      confirmItineraryImport(TRIP_ID, input),
    ]);

    expect(results.filter((result) => result.success)).toHaveLength(2);
    const statuses = results.flatMap((result) =>
      result.success ? result.data.days.map((day) => day.status) : []
    );
    expect(statuses.sort()).toEqual(['already_imported', 'success']);
    expect(storedDays).toHaveLength(1);
    expect(storedDays[0].activities).toHaveLength(1);
  });

  it('returns per-day failures without rolling successful dates back', async () => {
    storedDays.push({
      _id: 'full-day',
      trip: TRIP_ID,
      dayNumber: 2,
      title: 'Full',
      content: '',
      activities: Array.from({ length: 15 }, (_, index) => ({ title: `Activity ${index}` })),
      appliedImportKeys: [],
    });

    const result = await confirmItineraryImport(
      TRIP_ID,
      draft([
        {
          date: '2026-09-01',
          title: 'Created',
          activities: [{ title: 'Success', type: 'other' }],
        },
        {
          date: '2026-09-02',
          activities: [{ title: 'Too much', type: 'other' }],
        },
      ])
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        days: [
          { date: '2026-09-01', status: 'success' },
          { date: '2026-09-02', status: 'failed', errorCode: 'ACTIVITY_LIMIT' },
        ],
        summary: { successfulDays: 1, failedDays: 1, addedActivities: 1 },
      },
    });
    expect(storedDays.some((day) => day.dayNumber === 1)).toBe(true);
    expect(storedDays.find((day) => day.dayNumber === 2)?.activities).toHaveLength(15);
  });
});
