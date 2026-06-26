import { describe, it, expect } from 'vitest';
import { calculateSettlement, applyPayments, formatAmount } from '@/lib/settlement';

describe('calculateSettlement', () => {
  it('should return empty array when no balances', () => {
    expect(calculateSettlement([])).toEqual([]);
  });

  it('should return empty array when all balances are zero', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 0 },
      { userId: '2', username: 'Bob', balance: 0 },
    ];
    expect(calculateSettlement(balances)).toEqual([]);
  });

  it('should handle simple two-person settlement', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100 }, // Alice is owed 100
      { userId: '2', username: 'Bob', balance: -100 }, // Bob owes 100
    ];
    const result = calculateSettlement(balances);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: 'Bob',
      to: 'Alice',
      amount: 100,
    });
  });

  it('should handle three-person settlement', () => {
    // Alice paid 300 for everyone (split 3 ways = 100 each)
    // Alice balance: 300 - 100 = 200 (owed 200)
    // Bob balance: 0 - 100 = -100 (owes 100)
    // Charlie balance: 0 - 100 = -100 (owes 100)
    const balances = [
      { userId: '1', username: 'Alice', balance: 200 },
      { userId: '2', username: 'Bob', balance: -100 },
      { userId: '3', username: 'Charlie', balance: -100 },
    ];
    const result = calculateSettlement(balances);

    expect(result).toHaveLength(2);

    const totalPaidToAlice = result
      .filter((t) => t.to === 'Alice')
      .reduce((sum, t) => sum + t.amount, 0);
    expect(totalPaidToAlice).toBe(200);
  });

  it('should minimize number of transactions', () => {
    // 4 people, but can be settled in 3 transactions
    const balances = [
      { userId: '1', username: 'Alice', balance: 150 },
      { userId: '2', username: 'Bob', balance: -50 },
      { userId: '3', username: 'Charlie', balance: -50 },
      { userId: '4', username: 'Dave', balance: -50 },
    ];
    const result = calculateSettlement(balances);

    expect(result).toHaveLength(3);
    const totalAmount = result.reduce((sum, t) => sum + t.amount, 0);
    expect(totalAmount).toBe(150);
  });

  it('should ignore negligible balances (< 0.01)', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 0.005 },
      { userId: '2', username: 'Bob', balance: -0.005 },
    ];
    expect(calculateSettlement(balances)).toEqual([]);
  });

  it('should round amounts to 2 decimal places', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100.555 },
      { userId: '2', username: 'Bob', balance: -100.555 },
    ];
    const result = calculateSettlement(balances);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100.56); // Rounded
  });

  it('should handle complex multi-party settlement', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 300 },
      { userId: '2', username: 'Bob', balance: -200 },
      { userId: '3', username: 'Charlie', balance: 100 },
      { userId: '4', username: 'Dave', balance: -200 },
    ];
    const result = calculateSettlement(balances);

    // Verify net zero: total from == total to
    const totalFrom = result.reduce((sum, t) => sum + t.amount, 0);
    // Each creditor should receive what they're owed
    const aliceReceives = result
      .filter((t) => t.to === 'Alice')
      .reduce((sum, t) => sum + t.amount, 0);
    const charlieReceives = result
      .filter((t) => t.to === 'Charlie')
      .reduce((sum, t) => sum + t.amount, 0);

    expect(aliceReceives).toBe(300);
    expect(charlieReceives).toBe(100);
    expect(totalFrom).toBe(400);
  });

  it('should handle single person with zero balance among others', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 50 },
      { userId: '2', username: 'Bob', balance: 0 },
      { userId: '3', username: 'Charlie', balance: -50 },
    ];
    const result = calculateSettlement(balances);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      from: 'Charlie',
      to: 'Alice',
      amount: 50,
    });
  });
});

describe('applyPayments', () => {
  it('returns balances unchanged when there are no payments', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100 },
      { userId: '2', username: 'Bob', balance: -100 },
    ];
    expect(applyPayments(balances, [])).toEqual(balances);
  });

  it('a full repayment from debtor to creditor zeroes both balances', () => {
    // Bob owes Alice 100; Bob pays Alice 100 → both settle to 0.
    const balances = [
      { userId: '1', username: 'Alice', balance: 100 },
      { userId: '2', username: 'Bob', balance: -100 },
    ];
    const result = applyPayments(balances, [{ from: '2', to: '1', amount: 100 }]);
    expect(result.find((b) => b.userId === '1')!.balance).toBe(0);
    expect(result.find((b) => b.userId === '2')!.balance).toBe(0);
    expect(calculateSettlement(result.map((b) => ({ ...b })))).toEqual([]);
  });

  it('a partial repayment reduces the outstanding balance', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100 },
      { userId: '2', username: 'Bob', balance: -100 },
    ];
    const result = applyPayments(balances, [{ from: '2', to: '1', amount: 60 }]);
    expect(result.find((b) => b.userId === '1')!.balance).toBe(40);
    expect(result.find((b) => b.userId === '2')!.balance).toBe(-40);
  });

  it('accumulates multiple payments per user', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 200 },
      { userId: '2', username: 'Bob', balance: -100 },
      { userId: '3', username: 'Charlie', balance: -100 },
    ];
    const result = applyPayments(balances, [
      { from: '2', to: '1', amount: 100 },
      { from: '3', to: '1', amount: 100 },
    ]);
    expect(result.find((b) => b.userId === '1')!.balance).toBe(0);
    expect(result.find((b) => b.userId === '2')!.balance).toBe(0);
    expect(result.find((b) => b.userId === '3')!.balance).toBe(0);
  });

  it('ignores non-positive payment amounts', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100 },
      { userId: '2', username: 'Bob', balance: -100 },
    ];
    const result = applyPayments(balances, [
      { from: '2', to: '1', amount: 0 },
      { from: '2', to: '1', amount: -50 },
    ]);
    expect(result).toEqual(balances);
  });

  it('does not mutate the input and preserves extra fields', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 100, totalPaid: 100, totalOwed: 0 },
      { userId: '2', username: 'Bob', balance: -100, totalPaid: 0, totalOwed: 100 },
    ];
    const result = applyPayments(balances, [{ from: '2', to: '1', amount: 100 }]);
    // input untouched
    expect(balances[0].balance).toBe(100);
    expect(balances[1].balance).toBe(-100);
    // expense totals carried through (only `balance` is netted)
    expect(result[0]).toMatchObject({ totalPaid: 100, totalOwed: 0, balance: 0 });
    expect(result[1]).toMatchObject({ totalPaid: 0, totalOwed: 100, balance: 0 });
  });

  it('can overshoot a balance (overpayment flips the sign)', () => {
    const balances = [
      { userId: '1', username: 'Alice', balance: 50 },
      { userId: '2', username: 'Bob', balance: -50 },
    ];
    const result = applyPayments(balances, [{ from: '2', to: '1', amount: 80 }]);
    // Bob overpaid by 30: now Alice owes Bob 30.
    expect(result.find((b) => b.userId === '1')!.balance).toBe(-30);
    expect(result.find((b) => b.userId === '2')!.balance).toBe(30);
  });
});

describe('formatAmount', () => {
  it('should format amount in TWD currency', () => {
    const result = formatAmount(1000);
    expect(result).toContain('1,000');
  });

  it('should handle zero', () => {
    const result = formatAmount(0);
    expect(result).toContain('0');
  });

  it('should handle negative amounts', () => {
    const result = formatAmount(-500);
    expect(result).toContain('500');
  });
});
