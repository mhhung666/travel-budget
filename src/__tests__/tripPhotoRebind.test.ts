import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const tripFindById = vi.fn();
const tripFindByIdAndUpdate = vi.fn();
const rebindAutoPhotosToItinerary = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));
vi.mock('@/lib/photoItinerary', () => ({
  rebindAutoPhotosToItinerary: (...args: unknown[]) => rebindAutoPhotosToItinerary(...args),
}));
vi.mock('@/models', () => ({
  Trip: {
    findById: (...args: unknown[]) => tripFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => tripFindByIdAndUpdate(...args),
  },
  Expense: {},
  ItineraryDay: {},
  Payment: {},
  Checklist: {},
  Notification: {},
  ActivityLog: {},
  Comment: {},
  Note: {},
  Photo: {},
  FlightRecord: {},
  StayRecord: {},
}));

import { updateTrip } from '@/actions/trip.actions';

const USER_ID = '507f191e810c19729de860ea';
const TRIP_ID = '507f1f77bcf86cd799439011';
const chainSelectLean = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value) }),
});
const chainLean = (value: unknown) => ({ lean: () => Promise.resolve(value) });

const updatedTrip = {
  _id: { toString: () => TRIP_ID },
  name: 'Europe',
  description: '',
  startDate: new Date('2026-07-02T00:00:00.000Z'),
  endDate: new Date('2026-07-10T00:00:00.000Z'),
  destinationLocation: null,
  hashCode: 'europe26',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  members: [{ user: { toString: () => USER_ID }, role: 'admin', archivedAt: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: USER_ID });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'admin' });
  tripFindById.mockReturnValue(
    chainSelectLean({
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-10T00:00:00.000Z'),
    })
  );
  tripFindByIdAndUpdate.mockReturnValue(chainLean(updatedTrip));
  rebindAutoPhotosToItinerary.mockResolvedValue(undefined);
});

describe('updateTrip → 自動相片重綁', () => {
  it('旅程日期變動後以新區間重算 auto 關聯', async () => {
    const result = await updateTrip(TRIP_ID, { start_date: '2026-07-02' });

    expect(result.success).toBe(true);
    expect(rebindAutoPhotosToItinerary).toHaveBeenCalledWith(
      TRIP_ID,
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-10T00:00:00.000Z')
    );
  });

  it('只改名稱時不做不必要的相片重算', async () => {
    const result = await updateTrip(TRIP_ID, { name: 'Europe 2026' });

    expect(result.success).toBe(true);
    expect(rebindAutoPhotosToItinerary).not.toHaveBeenCalled();
    expect(tripFindById).not.toHaveBeenCalled();
  });
});
