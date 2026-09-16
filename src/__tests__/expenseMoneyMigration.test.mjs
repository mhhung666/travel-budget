// @vitest-environment node
import { expect, it } from 'vitest';
import { roundMoney, normalizeShares } from '../lib/money';
import {
  roundMoney as frozenRoundMoney,
  normalizeShares as frozenNormalizeShares,
  planExpenseMoney,
} from '../../migrations/20260916220000-normalize-expense-money.js';

// 遷移凍結了一份金額規則；在它寫入正式資料前必須與讀取端逐分相同。
function random(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

it('frozen rounding and share normalization match src/lib/money.ts', () => {
  const next = random(20260916);
  const cases = [
    [30.125, [30.125]],
    [30.124999999999, [30.124999999999]],
    [30.25, [15.125, 15.125]],
    [10.01, [5.005, 5.005]],
    [1000, [500, 499.99]],
    [1000, [500, 400]],
    [100, [33.333333, 33.333333, 33.333334]],
    [0, []],
    [12, [0, 0]],
  ];
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(next() * 6);
    const amount = Math.floor(next() * 1e7) / 1000;
    const weights = Array.from({ length: n }, () => next());
    const sum = weights.reduce((a, b) => a + b, 0);
    const noise = next() < 0.2 ? (next() - 0.5) * 0.2 : 0;
    cases.push([amount, weights.map((w) => (amount * w) / sum + noise / n)]);
  }
  for (const [amount, shares] of cases) {
    expect(frozenRoundMoney(amount)).toBe(roundMoney(amount));
    expect(frozenNormalizeShares(amount, shares), JSON.stringify([amount, shares])).toEqual(
      normalizeShares(amount, shares)
    );
  }
});

it('plans only real changes and reports anomalies without redistributing them', () => {
  expect(
    planExpenseMoney({ amount: 30, splits: [{ shareAmount: 15 }, { shareAmount: 15 }] }).changed
  ).toBe(false);
  expect(
    planExpenseMoney({ amount: 30.25, splits: [{ shareAmount: 15.125 }, { shareAmount: 15.125 }] })
  ).toEqual({ changed: true, amount: 30.25, shares: [15.13, 15.12], anomalies: [] });
  expect(
    planExpenseMoney({ amount: 1000, splits: [{ shareAmount: 500.004 }, { shareAmount: 400 }] })
  ).toEqual({ changed: true, amount: 1000, shares: [500, 400], anomalies: ['unbalanced'] });
  expect(
    planExpenseMoney({ amount: 30, originalAmount: 1, exchangeRate: 31, splits: [] }).anomalies
  ).toEqual(['exchange']);
  expect(planExpenseMoney({ amount: 12, splits: [{ shareAmount: null }] })).toMatchObject({
    changed: true,
    shares: [0],
  });
});
