// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ trip: vi.fn(), expenses: vi.fn(), payments: vi.fn() }));
vi.mock('@/models', () => ({
  Trip: { findById: mocks.trip },
  Expense: { find: mocks.expenses },
  Payment: { find: mocks.payments },
  User: { find: vi.fn() },
}));
import { readSettlement, readSettlementDetail } from '@/lib/settlementRead';

const TRIP = '507f1f77bcf86cd799439011';
const [AMY, BOB, CARA] = [
  '507f191e810c19729de860ea',
  '507f191e810c19729de860eb',
  '507f191e810c19729de860ec',
];
const ref = (id: string) => ({ toString: () => id });
const member = (id: string, displayName: string) => ({
  user: { _id: ref(id), username: `login-${displayName}`, displayName },
});
function setup(names: [string, string, string] = ['Amy', 'Bob', 'Cara']) {
  mocks.trip.mockReturnValue({
    populate: () => ({
      select: () => ({
        lean: () =>
          Promise.resolve({
            members: [member(AMY, names[0]), member(BOB, names[1]), member(CARA, names[2])],
          }),
      }),
    }),
  });
  mocks.expenses.mockReturnValue({
    select: () => ({
      lean: () =>
        Promise.resolve([
          {
            payer: ref(AMY),
            amount: 90,
            splits: [AMY, BOB, CARA].map((id) => ({ user: ref(id), shareAmount: 30 })),
          },
        ]),
    }),
  });
  mocks.payments.mockReturnValue({
    sort: () => ({
      populate: () => ({
        populate: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }),
      }),
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

describe('readSettlementDetail', () => {
  it('adds member-id transfers without changing the display-name transactions', async () => {
    const detail = await readSettlementDetail(TRIP);
    // Equal debts keep member order (stable sort), exactly as before the refactor.
    expect(detail.transactions).toEqual([
      { from: 'Bob', to: 'Amy', amount: 30 },
      { from: 'Cara', to: 'Amy', amount: 30 },
    ]);
    expect(detail.transfers).toEqual([
      { fromId: BOB, toId: AMY, amount: 30 },
      { fromId: CARA, toId: AMY, amount: 30 },
    ]);
  });

  it('keeps transfers distinguishable when members share a display name', async () => {
    setup(['Amy', 'Sam', 'Sam']);
    const detail = await readSettlementDetail(TRIP);
    expect(detail.transactions.map((t) => t.from)).toEqual(['Sam', 'Sam']);
    expect(detail.transfers.map((t) => t.fromId)).toEqual([BOB, CARA]);
  });

  it('leaves the Web and public settlement result exactly as before', async () => {
    const result = await readSettlement(TRIP);
    expect(Object.keys(result).sort()).toEqual(
      ['balances', 'payments', 'totalExpenses', 'transactions'].sort()
    );
    const { transfers, ...detail } = await readSettlementDetail(TRIP);
    expect(transfers).toHaveLength(2);
    expect(result).toEqual(detail);
  });
});
