import { describe, expect, it } from 'vitest';
import type { Settlement } from '@/api/contracts';
import { orderTransfers, viewerBalance } from './view';

const [amy, bob, cara] = ['a', 'b', 'c'].map((letter) => letter.repeat(24));
const transfer = (fromId: string, toId: string, amount: number) => ({
  fromId,
  fromName: fromId,
  toId,
  toName: toId,
  amount,
});
const settlement = {
  status: 'outstanding',
  totalExpenses: 90,
  balances: [
    { userId: amy, displayName: 'Amy', totalPaid: 90, totalOwed: 30, balance: 60 },
    { userId: bob, displayName: 'Bob', totalPaid: 0, totalOwed: 30, balance: -30 },
  ],
  suggestedTransfers: [],
  payments: [],
} satisfies Settlement;

describe('settlement view', () => {
  it('puts the viewer’s own transfers first without disturbing the rest', () => {
    const all = [transfer(bob, cara, 1), transfer(cara, amy, 2), transfer(bob, amy, 3)];
    expect(orderTransfers(all, amy)).toEqual([all[1], all[2], all[0]]);
    expect(orderTransfers(all, cara)).toEqual([all[0], all[1], all[2]]);
    expect(orderTransfers(all, undefined)).toBe(all);
    expect(all.map((item) => item.amount)).toEqual([1, 2, 3]);
  });
  it('finds the viewer’s balance, or null for a non-participant', () => {
    expect(viewerBalance(settlement, amy)).toBe(60);
    expect(viewerBalance(settlement, bob)).toBe(-30);
    expect(viewerBalance(settlement, cara)).toBeNull();
    expect(viewerBalance(settlement, undefined)).toBeNull();
  });
});
