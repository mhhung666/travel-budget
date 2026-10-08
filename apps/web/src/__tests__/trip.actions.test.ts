import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const getMemberTrip = vi.fn();
const dbConnect = vi.fn();
const tripExists = vi.fn();
const tripCreate = vi.fn();
const tripFindByIdAndUpdate = vi.fn();
const tripFindById = vi.fn();
const tripFindOne = vi.fn();
const tripFindOneAndUpdate = vi.fn();
const tripDeleteOne = vi.fn();
const tripUpdateOne = vi.fn();
const deleteByPrefix = vi.fn();
const notify = vi.fn();
const logActivity = vi.fn();
const revalidatePath = vi.fn();
const loggerError = vi.fn();
const expenseAggregate = vi.fn();
const cascade = {
  expense: vi.fn(),
  itinerary: vi.fn(),
  payment: vi.fn(),
  checklist: vi.fn(),
  notification: vi.fn(),
  activity: vi.fn(),
  comment: vi.fn(),
  note: vi.fn(),
  photo: vi.fn(),
  flight: vi.fn(),
  stay: vi.fn(),
  usage: vi.fn(),
};

const entry = vi.hoisted(() => ({ enter: vi.fn() }));
vi.mock('@/lib/tripEntry', async (original) => ({
  ...(await original<typeof import('@/lib/tripEntry')>()),
  enterTrip: entry.enter,
}));
const deletion = vi.hoisted(() => ({ commit: vi.fn(), cleanup: vi.fn() }));
vi.mock('@/lib/tripDeletion', () => ({
  deleteTripAtomically: deletion.commit,
  TripDeletionError: class extends Error {},
}));
vi.mock('@/lib/tripCleanup', () => ({ runTripCleanup: deletion.cleanup }));
const management = vi.hoisted(() => ({ update: vi.fn(), archive: vi.fn() }));
vi.mock('@/lib/tripManagement', async (original) => ({
  ...(await original<typeof import('@/lib/tripManagement')>()),
  updateTripForActor: management.update,
  archiveTripForActor: management.archive,
}));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: (...args: unknown[]) => dbConnect(...args) }));
vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
  getMemberTrip: (...args: unknown[]) => getMemberTrip(...args),
}));
vi.mock('@/lib/hashcode', () => ({
  generateUniqueHashCode: async (exists: (code: string) => Promise<boolean>) => {
    await exists('newcode1');
    return 'newcode1';
  },
}));
vi.mock('@/lib/storage', () => ({
  deleteByPrefix: (...args: unknown[]) => deleteByPrefix(...args),
}));
vi.mock('@/lib/notify', () => ({
  notify: (...args: unknown[]) => notify(...args),
  deliverJoinNotification: vi.fn(),
}));
vi.mock('@/lib/activity', () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock('@/lib/photoItinerary', () => ({ rebindAutoPhotosToItinerary: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));
vi.mock('@/models', () => ({
  Trip: {
    exists: (...args: unknown[]) => tripExists(...args),
    create: (...args: unknown[]) => tripCreate(...args),
    findByIdAndUpdate: (...args: unknown[]) => tripFindByIdAndUpdate(...args),
    findById: (...args: unknown[]) => tripFindById(...args),
    findOne: (...args: unknown[]) => tripFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => tripFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => tripDeleteOne(...args),
    updateOne: (...args: unknown[]) => tripUpdateOne(...args),
  },
  Expense: {
    deleteMany: (...args: unknown[]) => cascade.expense(...args),
    aggregate: (...args: unknown[]) => expenseAggregate(...args),
  },
  ItineraryDay: { deleteMany: (...args: unknown[]) => cascade.itinerary(...args) },
  Payment: { deleteMany: (...args: unknown[]) => cascade.payment(...args) },
  Checklist: { deleteMany: (...args: unknown[]) => cascade.checklist(...args) },
  Notification: { deleteMany: (...args: unknown[]) => cascade.notification(...args) },
  ActivityLog: { deleteMany: (...args: unknown[]) => cascade.activity(...args) },
  Comment: { deleteMany: (...args: unknown[]) => cascade.comment(...args) },
  Note: { deleteMany: (...args: unknown[]) => cascade.note(...args) },
  Photo: { deleteMany: (...args: unknown[]) => cascade.photo(...args) },
  FlightRecord: { updateMany: (...args: unknown[]) => cascade.flight(...args) },
  StayRecord: { updateMany: (...args: unknown[]) => cascade.stay(...args) },
  AiImportUsage: { deleteMany: (...args: unknown[]) => cascade.usage(...args) },
}));

import {
  createTrip,
  deleteTrip,
  getTripShell,
  joinTrip,
  regenerateHashCode,
  updateTrip,
} from '@/actions/trip.actions';

const USER = '507f191e810c19729de860ea';
const TRIP = '507f1f77bcf86cd799439011';

function lean(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function tripDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => TRIP },
    name: 'Tokyo',
    description: '',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-05T00:00:00.000Z'),
    destinationLocation: null,
    hashCode: 'oldcode1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    members: [{ user: { toString: () => USER }, role: 'admin', archivedAt: null }],
    ...overrides,
  };
}

beforeEach(() => {
  deletion.commit.mockReset().mockResolvedValue(undefined);
  deletion.cleanup.mockReset().mockResolvedValue({ status: 'swept' });
  vi.clearAllMocks();
  entry.enter.mockReset();
  revalidatePath.mockReset();
  tripFindById.mockReset();
  tripFindOne.mockReset();
  getSession.mockResolvedValue({ userId: USER });
  getTripMembership.mockResolvedValue({ tripId: TRIP, role: 'admin' });
  getMemberTrip.mockResolvedValue({
    trip: tripDoc(),
    membership: { tripId: TRIP, role: 'admin' },
  });
  dbConnect.mockResolvedValue(undefined);
  tripExists.mockResolvedValue(null);
  management.update.mockReset().mockResolvedValue(tripDoc());
  management.archive.mockReset().mockResolvedValue(tripDoc());
  tripFindByIdAndUpdate.mockReturnValue(lean(tripDoc()));
  tripFindById.mockReturnValue(selectLean(tripDoc()));
  tripFindOne.mockReturnValue(lean(tripDoc()));
  expenseAggregate.mockResolvedValue([{ expenseCount: 3, todaySpent: 1200, totalSpent: 1800 }]);
  tripFindOneAndUpdate.mockReturnValue(lean(tripDoc()));
  tripDeleteOne.mockResolvedValue({ deletedCount: 1 });
  tripUpdateOne.mockResolvedValue({ matchedCount: 1 });
  deleteByPrefix.mockResolvedValue(undefined);
  notify.mockResolvedValue(undefined);
  logActivity.mockResolvedValue(undefined);
  for (const operation of Object.values(cascade)) operation.mockResolvedValue({ deletedCount: 1 });
});

describe('getTripShell', () => {
  it('returns aggregate counters without loading member profiles or expense rows', async () => {
    const result = await getTripShell('oldcode1');

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: TRIP,
        name: 'Tokyo',
        role: 'admin',
        member_count: 1,
        expense_count: 3,
        today_spent: 1200,
        total_spent: 1800,
      }),
    });
    expect(getMemberTrip).toHaveBeenCalledWith(
      USER,
      'oldcode1',
      'name startDate endDate hashCode legacyBudget currencySettings'
    );
    expect(tripFindById).not.toHaveBeenCalled();
    expect(expenseAggregate).toHaveBeenCalledOnce();
  });
});

describe('createTrip', () => {
  it('rejects unauthenticated and invalid requests before connecting to the database', async () => {
    getSession.mockResolvedValueOnce(null);
    expect(await createTrip({ name: 'Tokyo' })).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
      code: 'UNAUTHORIZED',
    });

    const invalid = await createTrip({ name: '' });
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error('expected failure');
    expect(invalid.code).toBe('VALIDATION_ERROR');
    expect(dbConnect).not.toHaveBeenCalled();
    expect(tripCreate).not.toHaveBeenCalled();
  });

  it('returns the committed ID without a second trip read', async () => {
    entry.enter.mockResolvedValue({ tripId: TRIP });
    const result = await createTrip({
      name: ' Tokyo 2026 ',
      description: '  Autumn trip  ',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
    });

    expect(result).toEqual({ success: true, data: { id: TRIP } });
    expect(tripFindById).not.toHaveBeenCalled();
    expect(tripFindOne).not.toHaveBeenCalled();
    expect(entry.enter).toHaveBeenCalledWith(
      undefined,
      USER,
      'trip.create',
      expect.objectContaining({
        name: 'Tokyo 2026',
        description: 'Autumn trip',
        start_date: '2026-09-01',
        end_date: '2026-09-05',
        client_request_id: expect.any(String),
      }),
      undefined,
      undefined
    );
    expect(revalidatePath).toHaveBeenCalledWith('/trips');
  });
  it.each(['unavailable', 'missing'])(
    'keeps committed success when a later read is %s',
    async (failure) => {
      entry.enter.mockResolvedValue({ tripId: TRIP });
      const read = () => {
        if (failure === 'unavailable') throw new Error('read unavailable');
        return lean(null);
      };
      tripFindById.mockImplementationOnce(read);
      tripFindOne.mockImplementationOnce(read);
      expect(await createTrip({ name: 'Tokyo' })).toEqual({ success: true, data: { id: TRIP } });
      expect(entry.enter).toHaveBeenCalledOnce();
      expect(tripFindById).not.toHaveBeenCalled();
      expect(tripFindOne).not.toHaveBeenCalled();
    }
  );
  it('keeps committed success when cache refresh fails', async () => {
    entry.enter.mockResolvedValue({ tripId: TRIP });
    revalidatePath.mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });
    expect(await createTrip({ name: 'Tokyo' })).toEqual({ success: true, data: { id: TRIP } });
  });
  it('still reports a write failure without returning a created ID', async () => {
    entry.enter.mockRejectedValueOnce(new Error('transaction aborted'));
    expect(await createTrip({ name: 'Tokyo' })).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('admin-only trip mutations', () => {
  it.each([
    ['update', (id: string) => updateTrip(id, { name: 'Updated' })],
    ['delete', (id: string) => deleteTrip(id)],
    ['regenerate', (id: string) => regenerateHashCode(id)],
  ])('forbids a regular member from %s', async (_label, action) => {
    getTripMembership.mockResolvedValue({ tripId: TRIP, role: 'member' });
    const result = await action(TRIP);
    expect(result).toEqual({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
    expect(tripFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(tripDeleteOne).not.toHaveBeenCalled();
  });

  it('updates a trip through its resolved id', async () => {
    management.update.mockResolvedValueOnce(tripDoc({ name: 'Updated' }));
    const result = await updateTrip('oldcode1', { name: ' Updated ' });
    expect(result.success).toBe(true);
    expect(management.update.mock.calls[0].slice(1)).toEqual([USER, TRIP, { name: 'Updated' }]);
    expect(revalidatePath).toHaveBeenCalledWith('/trips/oldcode1');
  });

  it('commits deletion before starting durable storage cleanup', async () => {
    expect((await deleteTrip('oldcode1')).success).toBe(true);
    expect(deletion.commit.mock.calls[0].slice(1)).toEqual([TRIP, USER]);
    expect(deletion.commit.mock.invocationCallOrder[0]).toBeLessThan(
      deletion.cleanup.mock.invocationCallOrder[0]
    );
  });
  it('does not fail committed deletion when cleanup is unavailable', async () => {
    deletion.cleanup.mockRejectedValueOnce(new Error('storage unavailable'));
    expect((await deleteTrip(TRIP)).success).toBe(true);
  });
  it('does not start external cleanup if the transaction fails', async () => {
    deletion.commit.mockRejectedValueOnce(new Error('transaction failed'));
    expect((await deleteTrip(TRIP)).success).toBe(false);
    expect(deletion.cleanup).not.toHaveBeenCalled();
  });

  it('replaces the share code and invalidates both trip routes', async () => {
    tripFindOneAndUpdate.mockReturnValue(lean(tripDoc({ hashCode: 'newcode1' })));
    const result = await regenerateHashCode('oldcode1');
    expect(result.success).toBe(true);
    expect(tripFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: TRIP,
        expenseDeliveryDeleting: { $ne: true },
        members: { $elemMatch: { user: USER, role: 'admin' } },
      },
      { $set: { hashCode: 'newcode1' } },
      { new: true }
    );
    expect(revalidatePath).toHaveBeenCalledWith('/trips');
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP}`);
  });
});

describe('joinTrip', () => {
  it('rejects an empty code before calling the shared service', async () => {
    expect(await joinTrip('')).toEqual({
      success: false,
      error: 'VALIDATION_ERROR',
      code: 'VALIDATION_ERROR',
    });
    expect(entry.enter).not.toHaveBeenCalled();
  });
  it('uses the shared service and returns an already joined trip successfully', async () => {
    entry.enter.mockResolvedValue({ tripId: TRIP, alreadyMember: true });
    expect((await joinTrip('oldcode1')).success).toBe(true);
    expect(tripFindOne).toHaveBeenCalledWith({
      _id: TRIP,
      'members.user': USER,
      expenseDeliveryDeleting: { $ne: true },
    });
    expect(tripFindById).not.toHaveBeenCalled();
    expect(entry.enter).toHaveBeenCalledWith(
      undefined,
      USER,
      'trip.join',
      expect.objectContaining({ invite_code: 'oldcode1', client_request_id: expect.any(String) }),
      expect.any(Function)
    );
    expect(notify).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it.each(['removed', 'deleting'])(
    'does not return private trip fields if the caller is %s during delivery',
    async (state) => {
      const current = tripDoc({
        hashCode: 'rotated1',
        ...(state === 'removed' ? { members: [] } : { expenseDeliveryDeleting: true }),
      });
      entry.enter.mockImplementationOnce(async () => {
        tripFindById.mockReturnValue(lean(current));
        tripFindOne.mockImplementationOnce((filter) =>
          lean(
            filter['members.user'] === USER &&
              (state === 'removed' || filter.expenseDeliveryDeleting?.$ne === true)
              ? null
              : current
          )
        );
        return { tripId: TRIP, alreadyMember: false };
      });
      expect(await joinTrip('oldcode1')).toEqual({
        success: false,
        error: 'NOT_FOUND',
        code: 'NOT_FOUND',
      });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(tripFindById).not.toHaveBeenCalled();
    }
  );
  it('maps invalid invitations without performing adapter side effects', async () => {
    const { TripEntryError } = await import('@/lib/tripEntry');
    entry.enter.mockRejectedValueOnce(new TripEntryError('INVITATION_INVALID'));
    expect(await joinTrip('missing1')).toEqual({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    expect(notify).not.toHaveBeenCalled();
  });
});

it('a committed Web update survives cache refresh failure', async () => {
  revalidatePath.mockImplementationOnce(() => {
    throw new Error('cache');
  });
  expect((await updateTrip(TRIP, { name: 'Updated' })).success).toBe(true);
});
