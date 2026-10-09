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
import { withLedgerV2 } from '@/lib/ledger';

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

  it('returns only the public settlement fields and the trip unit', async () => {
    const result = await withLedgerV2(() => readSettlement(TRIP));
    expect(Object.keys(result).sort()).toEqual(
      ['balances', 'ledger', 'payments', 'totalExpenses', 'transactions'].sort()
    );
    expect(result.ledger).toEqual({ baseCurrency: 'TWD', moneyScale: 2 });
    const { transfers, virtualMembers, ...detail } = await readSettlementDetail(TRIP);
    expect(transfers).toHaveLength(2);
    expect(result).toEqual({ ...detail, ledger: result.ledger });
    expect(virtualMembers).toBeDefined();
    expect(result).not.toHaveProperty('virtualMembers');
  });
});

it('retains distinct IDs for member suggestions without adding them to public transactions', async () => {
  setup(['SAME', 'SAME', 'SAME']);
  const { transfers } = await readSettlementDetail(TRIP);
  expect(transfers.map(({ fromId, toId }) => ({ fromId, toId }))).toEqual([
    { fromId: BOB, toId: AMY },
    { fromId: CARA, toId: AMY },
  ]);
  expect((await withLedgerV2(() => readSettlement(TRIP))).transactions).toEqual([
    { from: 'SAME', to: 'SAME', amount: 30 },
    { from: 'SAME', to: 'SAME', amount: 30 },
  ]);
});
