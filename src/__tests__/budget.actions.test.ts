import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const findOneAndUpdate = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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
}));

import { setTripBudget } from '@/actions/budget.actions';

const VIEWER = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';
const TRIP_ID = '507f1f77bcf86cd799439021';

function leanTrip(budget: { total: number | null; categories: unknown[] } | null) {
  return {
    _id: { toString: () => TRIP_ID },
    name: 'Kyoto',
    description: '',
    hashCode: 'abcd1234',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    members: [
      { user: { toString: () => VIEWER }, role: 'member', budget },
      {
        user: { toString: () => OTHER },
        role: 'admin',
        budget: { total: 99999, categories: [] },
      },
    ],
  };
}

function mockUpdateReturns(doc: unknown) {
  findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(doc) });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP_ID, role: 'member' });
});

describe('setTripBudget', () => {
  it('allows a regular member and updates only the caller’s embedded budget', async () => {
    mockUpdateReturns(
      leanTrip({
        total: 30000,
        categories: [{ category: 'food', amount: 8000 }],
      })
    );

    const result = await setTripBudget(TRIP_ID, {
      total: 30000,
      categories: [
        { category: 'food', amount: 5000 },
        { category: 'food', amount: 8000 },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.budget).toEqual({
      total: 30000,
      categories: [{ category: 'food', amount: 8000 }],
    });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: TRIP_ID, 'members.user': VIEWER },
      {
        $set: {
          'members.$.budget': {
            total: 30000,
            categories: [{ category: 'food', amount: 8000 }],
          },
        },
      },
      { new: true }
    );
  });

  it('clears only the caller’s budget when every amount is empty or zero', async () => {
    mockUpdateReturns(leanTrip(null));

    const result = await setTripBudget(TRIP_ID, {
      total: 0,
      categories: [{ category: 'food', amount: 0 }],
    });

    expect(result.success).toBe(true);
    expect(findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { 'members.$.budget': null },
    });
  });

  it('returns NOT_FOUND when the caller is not a trip member', async () => {
    getTripMembership.mockResolvedValue(null);

    const result = await setTripBudget(TRIP_ID, { total: 1000 });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid amounts before writing', async () => {
    const result = await setTripBudget(TRIP_ID, { total: -1 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
