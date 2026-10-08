import { beforeEach, expect, it, vi } from 'vitest';
import { LedgerError } from '@/lib/ledger';
const h = vi.hoisted(() => ({ trips: vi.fn(), member: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ userId: 'a'.repeat(24) }) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => undefined }));
vi.mock('@/lib/permissions', () => ({ getMemberTrip: h.member, getTripMembership: h.member }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'unit-only-secret-with-32-characters' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/models', () => {
  const query = { select: () => query, populate: () => query, lean: h.trips };
  return {
    Trip: { find: () => query },
    Expense: { find: h.find },
    ItineraryDay: {},
    FlightRecord: {},
    StayRecord: {},
  };
});
import { getLedgerStats, getLedgerStatsExpensePage } from '@/actions/stats.actions';
import { getLedgerYearInReview } from '@/actions/wrapped.actions';
import { getLedgerExpenses } from '@/actions/expense.actions';
beforeEach(() => {
  vi.clearAllMocks();
  h.trips.mockRejectedValue(new LedgerError('LEDGER_DATA_INVALID'));
  h.member.mockRejectedValue(new LedgerError('LEDGER_DATA_INVALID'));
});
it.each([getLedgerStats, getLedgerStatsExpensePage, getLedgerYearInReview])(
  'preserves ledger data errors through read action catches',
  async (action) => {
    expect(await action()).toEqual({
      success: false,
      error: 'LEDGER_DATA_INVALID',
      code: 'LEDGER_DATA_INVALID',
    });
  }
);
it('authorizes and reads the expense roster once without a second membership probe', async () => {
  h.member.mockResolvedValue({ membership: { tripId: 'b'.repeat(24) }, trip: { members: [] } });
  const lean = vi.fn().mockResolvedValue([]);
  h.find.mockReturnValue({ sort: () => ({ lean }) });
  const { Expense } = await import('@/models');
  Object.assign(Expense, { populate: vi.fn().mockResolvedValue([]) });
  expect(await getLedgerExpenses('b'.repeat(24))).toEqual({ success: true, data: [] });
  expect(h.member).toHaveBeenCalledOnce();
});
it('returns LEDGER_DATA_INVALID when expense membership reads detect mixed child units', async () => {
  expect(await getLedgerExpenses('b'.repeat(24))).toEqual({
    success: false,
    error: 'LEDGER_DATA_INVALID',
    code: 'LEDGER_DATA_INVALID',
  });
});

it.each([getLedgerStats, getLedgerStatsExpensePage, getLedgerYearInReview])(
  'preserves aggregate range failures as a terminal money error',
  async (action) => {
    const { MoneyTotalError } = await import('@/lib/money');
    h.trips.mockRejectedValueOnce(new MoneyTotalError());
    expect(await action()).toEqual({
      success: false,
      error: 'MONEY_TOTAL_OUT_OF_RANGE',
      code: 'MONEY_TOTAL_OUT_OF_RANGE',
    });
  }
);

it('rejects the annual review when any roster member has a budget in a different ledger unit', async () => {
  const { Types } = await import('mongoose');
  h.trips.mockResolvedValueOnce([
    {
      _id: new Types.ObjectId(),
      baseCurrency: 'USD',
      members: [{ budget: { baseCurrency: 'TWD', total: 10, categories: [] } }],
    },
  ]);
  expect(await getLedgerYearInReview()).toEqual({
    success: false,
    error: 'LEDGER_DATA_INVALID',
    code: 'LEDGER_DATA_INVALID',
  });
});
