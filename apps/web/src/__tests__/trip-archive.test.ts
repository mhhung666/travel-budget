import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cookie adapter delegates to the shared per-member transaction service.
const getSession = vi.fn();
const getTripMembership = vi.fn();
const management = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock('@/lib/tripManagement', async (original) => ({
  ...(await original<typeof import('@/lib/tripManagement')>()),
  archiveTripForActor: management.archive,
}));
import { TripWriteError } from '@/lib/tripWriteTransaction';
const findOneAndUpdate = management.archive;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/mongodb', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  getSession: () => getSession(),
}));

vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));

vi.mock('@/models', () => ({
  Trip: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
  Expense: {},
  ItineraryDay: {},
}));

import { archiveTrip, unarchiveTrip } from '@/actions/trip.actions';

const VIEWER = 'viewer-1';
const TRIP_ID = 'trip-1';

// 模擬 Trip.findOneAndUpdate(...).lean() 回傳的 lean 文件；
// 個別封存：viewer 那筆 member 的 archivedAt 決定 DTO 的 archived_at。
function leanTrip(archivedAt: Date | null) {
  return {
    _id: { toString: () => TRIP_ID },
    name: 'Kyoto',
    description: '',
    startDate: null,
    endDate: null,
    destinationLocation: null,
    hashCode: 'abcd1234',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    members: [
      { user: { toString: () => VIEWER }, role: 'admin', archivedAt },
      // 另一名成員未封存：證明封存是個別的
      { user: { toString: () => 'other' }, role: 'member', archivedAt: null },
    ],
  };
}

function mockUpdateReturns(doc: unknown) {
  if (doc) management.archive.mockResolvedValueOnce(doc);
  else management.archive.mockRejectedValueOnce(new TripWriteError('FORBIDDEN'));
}

beforeEach(() => {
  vi.clearAllMocks();
  management.archive.mockReset();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'admin' });
});

describe('archiveTrip', () => {
  it('returns UNAUTHORIZED when there is no session', async () => {
    getSession.mockResolvedValue(null);

    const result = await archiveTrip(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the user is not a member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await archiveTrip(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("sets only the caller's own member.archivedAt and returns archived_at", async () => {
    mockUpdateReturns(leanTrip(new Date('2025-06-17T00:00:00.000Z')));

    const result = await archiveTrip(TRIP_ID);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.archived_at).toBe('2025-06-17T00:00:00.000Z');

    expect(management.archive.mock.calls[0].slice(1)).toEqual([VIEWER, TRIP_ID, true]);
  });

  it('returns NOT_FOUND when the trip disappears mid-update', async () => {
    mockUpdateReturns(null);

    const result = await archiveTrip(TRIP_ID);

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
  });
});

describe('unarchiveTrip', () => {
  it('clears archivedAt back to null and returns archived_at: null', async () => {
    mockUpdateReturns(leanTrip(null));

    const result = await unarchiveTrip(TRIP_ID);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.archived_at).toBeNull();

    expect(management.archive.mock.calls[0].slice(1)).toEqual([VIEWER, TRIP_ID, false]);
  });
});
