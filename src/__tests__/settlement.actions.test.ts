import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getTripMembership = vi.fn();
const dbConnect = vi.fn();
const tripFindById = vi.fn();
const expenseFind = vi.fn();
const paymentFind = vi.fn();
const loggerError = vi.fn();

vi.mock('@/lib/auth', () => ({ getSession: () => getSession() }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: (...args: unknown[]) => dbConnect(...args) }));
vi.mock('@/lib/permissions', () => ({
  getTripMembership: (...args: unknown[]) => getTripMembership(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));
vi.mock('@/models', () => ({
  Trip: { findById: (...args: unknown[]) => tripFindById(...args) },
  Expense: { find: (...args: unknown[]) => expenseFind(...args) },
  Payment: { find: (...args: unknown[]) => paymentFind(...args) },
}));

import { getSettlement } from '@/actions/settlement.actions';

const VIEWER = '507f191e810c19729de860ea';
const BOB = '507f191e810c19729de860eb';
const CARA = '507f191e810c19729de860ec';
const TRIP = '507f1f77bcf86cd799439011';

const ref = (id: string) => ({ toString: () => id });
const user = (id: string, displayName: string) => ({
  _id: ref(id),
  username: displayName.toLowerCase(),
  displayName,
});

function tripQuery(value: unknown) {
  return {
    populate: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }),
  };
}

function expenseQuery(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function paymentQuery(value: unknown) {
  return {
    sort: () => ({
      populate: () => ({
        populate: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: VIEWER });
  getTripMembership.mockResolvedValue({ tripId: TRIP, role: 'member' });
  dbConnect.mockResolvedValue(undefined);
  tripFindById.mockReturnValue(
    tripQuery({
      members: [
        { user: user(VIEWER, 'Amy') },
        { user: user(BOB, 'Bob') },
        { user: user(CARA, 'Cara') },
      ],
    })
  );
  expenseFind.mockReturnValue(expenseQuery([]));
  paymentFind.mockReturnValue(paymentQuery([]));
});

describe('getSettlement', () => {
  it('rejects unauthenticated callers before membership and database access', async () => {
    getSession.mockResolvedValue(null);
    expect(await getSettlement(TRIP)).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
      code: 'UNAUTHORIZED',
    });
    expect(getTripMembership).not.toHaveBeenCalled();
    expect(dbConnect).not.toHaveBeenCalled();
  });

  it('rejects non-members without loading settlement data', async () => {
    getTripMembership.mockResolvedValue(null);
    expect(await getSettlement(TRIP)).toEqual({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    expect(dbConnect).not.toHaveBeenCalled();
    expect(expenseFind).not.toHaveBeenCalled();
  });

  it('aggregates embedded splits, applies payments, and returns minimum transfers', async () => {
    expenseFind.mockReturnValue(
      expenseQuery([
        {
          payer: ref(VIEWER),
          amount: 90,
          splits: [
            { user: ref(VIEWER), shareAmount: 30 },
            { user: ref(BOB), shareAmount: 30 },
            { user: ref(CARA), shareAmount: 30 },
          ],
        },
      ])
    );
    paymentFind.mockReturnValue(
      paymentQuery([
        {
          _id: ref('507f1f77bcf86cd799439099'),
          from: user(BOB, 'Bob'),
          to: user(VIEWER, 'Amy'),
          amount: 10,
          note: 'transfer',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ])
    );

    const result = await getSettlement(TRIP);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.totalExpenses).toBe(90);
    expect(result.data.balances).toEqual([
      { userId: VIEWER, username: 'Amy', totalPaid: 90, totalOwed: 30, balance: 50 },
      { userId: BOB, username: 'Bob', totalPaid: 0, totalOwed: 30, balance: -20 },
      { userId: CARA, username: 'Cara', totalPaid: 0, totalOwed: 30, balance: -30 },
    ]);
    expect(result.data.transactions).toEqual([
      { from: 'Cara', to: 'Amy', amount: 30 },
      { from: 'Bob', to: 'Amy', amount: 20 },
    ]);
    expect(result.data.payments).toEqual([
      expect.objectContaining({ fromId: BOB, toId: VIEWER, amount: 10, note: 'transfer' }),
    ]);
  });

  it('handles a trip with no populated members as an empty settlement', async () => {
    tripFindById.mockReturnValue(tripQuery(null));
    const result = await getSettlement(TRIP);
    expect(result).toEqual({
      success: true,
      data: { balances: [], transactions: [], payments: [], totalExpenses: 0 },
    });
  });

  it('maps database failures to a stable internal error', async () => {
    dbConnect.mockRejectedValue(new Error('database unavailable'));
    expect(await getSettlement(TRIP)).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
    });
    expect(loggerError).toHaveBeenCalledWith('Get settlement error', expect.any(Error));
  });
});
