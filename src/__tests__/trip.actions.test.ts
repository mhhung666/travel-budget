import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const dbConnect = vi.fn();
const tripExists = vi.fn();
const tripCreate = vi.fn();
const tripFindByIdAndUpdate = vi.fn();
const tripFindById = vi.fn();
const tripFindOneAndUpdate = vi.fn();
const tripDeleteOne = vi.fn();
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

vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: (...args: unknown[]) => dbConnect(...args) }));
vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
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
vi.mock('@/lib/notify', () => ({ notify: (...args: unknown[]) => notify(...args) }));
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
    findOneAndUpdate: (...args: unknown[]) => tripFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => tripDeleteOne(...args),
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
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: USER });
  getTripMembership.mockResolvedValue({ tripId: TRIP, role: 'admin' });
  dbConnect.mockResolvedValue(undefined);
  tripExists.mockResolvedValue(null);
  tripFindByIdAndUpdate.mockReturnValue(lean(tripDoc()));
  tripFindById.mockReturnValue(selectLean(tripDoc()));
  expenseAggregate.mockResolvedValue([{ expenseCount: 3, todaySpent: 1200, totalSpent: 1800 }]);
  tripFindOneAndUpdate.mockReturnValue(lean(tripDoc()));
  tripDeleteOne.mockResolvedValue({ deletedCount: 1 });
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
    expect(tripFindById).toHaveBeenCalledWith(TRIP);
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

  it('creates the caller as admin with a generated share code', async () => {
    const doc = tripDoc({ hashCode: 'newcode1', name: 'Tokyo 2026' });
    tripCreate.mockResolvedValue({ toObject: () => doc });
    const result = await createTrip({
      name: ' Tokyo 2026 ',
      description: '  Autumn trip  ',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
    });

    expect(result.success).toBe(true);
    expect(tripExists).toHaveBeenCalledWith({ hashCode: 'newcode1' });
    expect(tripCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Tokyo 2026',
        description: 'Autumn trip',
        hashCode: 'newcode1',
        members: [{ user: USER, role: 'admin' }],
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/trips');
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
    tripFindByIdAndUpdate.mockReturnValue(lean(tripDoc({ name: 'Updated' })));
    const result = await updateTrip('oldcode1', { name: ' Updated ' });
    expect(result.success).toBe(true);
    expect(tripFindByIdAndUpdate).toHaveBeenCalledWith(
      TRIP,
      { $set: { name: 'Updated' } },
      { new: true }
    );
    expect(revalidatePath).toHaveBeenCalledWith('/trips/oldcode1');
  });

  it('cascades trip deletion while retaining user-level flight and stay records', async () => {
    const result = await deleteTrip('oldcode1');
    expect(result.success).toBe(true);
    for (const key of [
      'expense',
      'itinerary',
      'payment',
      'checklist',
      'notification',
      'activity',
      'comment',
      'note',
      'photo',
    ] as const) {
      expect(cascade[key]).toHaveBeenCalledWith({ trip: TRIP });
    }
    expect(cascade.flight).toHaveBeenCalledWith({ trip: TRIP }, { $set: { trip: null } });
    expect(cascade.stay).toHaveBeenCalledWith({ trip: TRIP }, { $set: { trip: null } });
    expect(cascade.usage).toHaveBeenCalledWith({ scope: 'trip', scopeKey: TRIP });
    expect(tripDeleteOne).toHaveBeenCalledWith({ _id: TRIP });
    expect(deleteByPrefix.mock.calls).toEqual([
      ['receipts', `receipts/${TRIP}/`],
      ['receipts', `itinerary/${TRIP}/`],
      ['receipts', `notes/${TRIP}/`],
      ['receipts', `photos/${TRIP}/`],
    ]);
  });

  it('does not fail deletion when blob cleanup is unavailable', async () => {
    deleteByPrefix.mockRejectedValueOnce(new Error('R2 unavailable'));
    const result = await deleteTrip(TRIP);
    expect(result.success).toBe(true);
    expect(loggerError).toHaveBeenCalledWith('Delete trip: blob cleanup failed', expect.any(Error));
  });

  it('replaces the share code and invalidates both trip routes', async () => {
    tripFindByIdAndUpdate.mockReturnValue(lean(tripDoc({ hashCode: 'newcode1' })));
    const result = await regenerateHashCode('oldcode1');
    expect(result.success).toBe(true);
    expect(tripFindByIdAndUpdate).toHaveBeenCalledWith(
      TRIP,
      { $set: { hashCode: 'newcode1' } },
      { new: true }
    );
    expect(revalidatePath).toHaveBeenCalledWith('/trips');
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP}`);
  });
});

describe('joinTrip', () => {
  it('rejects an empty code and an existing member without mutating the trip', async () => {
    const empty = await joinTrip('');
    expect(empty).toEqual({ success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' });

    const conflict = await joinTrip('oldcode1');
    expect(conflict).toEqual({ success: false, error: 'CONFLICT', code: 'CONFLICT' });
    expect(tripFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('joins by share code and emits member notifications only after success', async () => {
    getTripMembership.mockResolvedValue(null);
    tripFindOneAndUpdate.mockReturnValue(lean(tripDoc()));
    const result = await joinTrip('oldcode1');
    expect(result.success).toBe(true);
    expect(tripFindOneAndUpdate).toHaveBeenCalledWith(
      { $or: [{ hashCode: 'oldcode1' }] },
      { $push: { members: { user: USER, role: 'member' } } },
      { new: true }
    );
    expect(notify).toHaveBeenCalledWith({
      tripId: TRIP,
      actorId: USER,
      type: 'member_joined',
    });
    expect(logActivity).toHaveBeenCalledWith({
      tripId: TRIP,
      actorId: USER,
      type: 'member_joined',
    });
  });

  it('returns not found and emits no side effects for an unknown code', async () => {
    getTripMembership.mockResolvedValue(null);
    tripFindOneAndUpdate.mockReturnValue(lean(null));
    expect(await joinTrip('missing1')).toEqual({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    expect(notify).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});
