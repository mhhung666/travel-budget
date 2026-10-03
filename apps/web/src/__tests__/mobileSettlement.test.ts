// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ membership: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ getTripMembership: mocks.membership }));
vi.mock('@/lib/settlementRead', () => ({ readSettlementDetail: mocks.read }));
import { mobileSettlement, settlementStatus, toMobileSettlement } from '@/lib/mobile/settlement';
import type { SettlementDetail } from '@/lib/settlementRead';

const amy = '507f191e810c19729de860ea';
const bob = '507f191e810c19729de860eb';
const cara = '507f191e810c19729de860ec';
const tripId = '507f1f77bcf86cd799439011';
const balance = (userId: string, name: string, paid: number, owed: number, net: number) => ({
  userId,
  username: name,
  totalPaid: paid,
  totalOwed: owed,
  balance: net,
});
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439099',
  fromId: bob,
  fromName: 'Bob',
  toId: amy,
  toName: 'Amy',
  amount: 10,
  note: 'cash',
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});
const outstanding = (): SettlementDetail => ({
  totalExpenses: 90,
  balances: [
    balance(amy, 'Amy', 90, 30, 50),
    balance(bob, 'Bob', 0, 30, -20),
    balance(cara, 'Cara', 0, 30, -30),
  ],
  transactions: [
    { from: 'Cara', to: 'Amy', amount: 30 },
    { from: 'Bob', to: 'Amy', amount: 20 },
  ],
  transfers: [
    { fromId: cara, toId: amy, amount: 30 },
    { fromId: bob, toId: amy, amount: 20 },
  ],
  payments: [payment()],
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ tripId, role: 'member' });
  mocks.read.mockResolvedValue(outstanding());
});

describe('mobile settlement DTO', () => {
  it('maps balances, suggested transfers and registered payments with member ids', () => {
    expect(toMobileSettlement(outstanding())).toEqual({
      status: 'outstanding',
      totalExpenses: 90,
      balances: [
        { userId: amy, displayName: 'Amy', totalPaid: 90, totalOwed: 30, balance: 50 },
        { userId: bob, displayName: 'Bob', totalPaid: 0, totalOwed: 30, balance: -20 },
        { userId: cara, displayName: 'Cara', totalPaid: 0, totalOwed: 30, balance: -30 },
      ],
      suggestedTransfers: [
        { fromId: cara, fromName: 'Cara', toId: amy, toName: 'Amy', amount: 30 },
        { fromId: bob, fromName: 'Bob', toId: amy, toName: 'Amy', amount: 20 },
      ],
      payments: [
        {
          id: '507f1f77bcf86cd799439099',
          fromId: bob,
          fromName: 'Bob',
          toId: amy,
          toName: 'Amy',
          amount: 10,
          note: 'cash',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('keeps members with the same display name distinguishable by id', () => {
    const detail = outstanding();
    detail.balances[1].username = 'Sam';
    detail.balances[2].username = 'Sam';
    const result = toMobileSettlement(detail);
    expect(result.suggestedTransfers.map((transfer) => transfer.fromId)).toEqual([cara, bob]);
    expect(result.suggestedTransfers.map((transfer) => transfer.fromName)).toEqual(['Sam', 'Sam']);
  });

  it('distinguishes no expenses, settled and outstanding', () => {
    const empty: SettlementDetail = {
      totalExpenses: 0,
      balances: [balance(amy, 'Amy', 0, 0, 0), balance(bob, 'Bob', 0, 0, 0)],
      transactions: [],
      transfers: [],
      payments: [],
    };
    expect(settlementStatus(empty)).toBe('empty');
    // Expenses exist and every balance is cleared by registered payments.
    expect(settlementStatus({ ...empty, totalExpenses: 90, payments: [payment()] })).toBe(
      'settled'
    );
    expect(settlementStatus({ ...empty, totalExpenses: 90 })).toBe('settled');
    expect(settlementStatus(outstanding())).toBe('outstanding');
  });

  it('reports a leftover balance as outstanding even when no transfer can be suggested', () => {
    const detail: SettlementDetail = {
      totalExpenses: 10,
      balances: [balance(amy, 'Amy', 10, 9.99, 0.01), balance(bob, 'Bob', 0, 0, 0)],
      transactions: [],
      transfers: [],
      payments: [],
    };
    expect(settlementStatus(detail)).toBe('outstanding');
    expect(toMobileSettlement(detail).suggestedTransfers).toEqual([]);
  });

  it('tolerates payments whose users no longer exist and empty notes', () => {
    const detail = outstanding();
    detail.payments = [
      payment({ fromId: '', fromName: 'Unknown', note: '' }),
      payment({ toId: '', toName: 'Unknown', note: null }),
    ];
    expect(toMobileSettlement(detail).payments).toMatchObject([
      { fromId: null, fromName: '', toId: amy, note: null },
      { fromId: bob, toId: null, toName: '', note: null },
    ]);
  });

  it('exposes exactly the whitelisted fields', () => {
    const result = toMobileSettlement(outstanding());
    expect(Object.keys(result).sort()).toEqual(
      ['balances', 'payments', 'status', 'suggestedTransfers', 'totalExpenses'].sort()
    );
    expect(Object.keys(result.balances[0]).sort()).toEqual(
      ['balance', 'displayName', 'totalOwed', 'totalPaid', 'userId'].sort()
    );
  });
});

describe('mobile settlement endpoint adapter', () => {
  it('authorizes the member and reads the trip settlement', async () => {
    const result = await mobileSettlement(amy, tripId);
    expect(mocks.membership).toHaveBeenCalledWith(amy, tripId);
    expect(mocks.read).toHaveBeenCalledWith(tripId);
    expect(result.status).toBe('outstanding');
  });

  it.each([
    ['non-member', null, tripId],
    ['malformed id', { tripId, role: 'member' }, 'nope'],
    ['share code', { tripId, role: 'member' }, 'abc12345'],
  ])('rejects a %s with 404 before reading financial data', async (_name, membership, id) => {
    mocks.membership.mockResolvedValue(membership);
    await expect(mobileSettlement(amy, id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
