import { describe, it, expect } from 'vitest';
import { computeSettlementDigests, type TripSettlementInput } from '@/lib/settlementReminder';

function trip(overrides: Partial<TripSettlementInput>): TripSettlementInput {
  return {
    tripHashCode: 't1',
    tripName: 'Trip 1',
    members: [{ userId: 'A' }, { userId: 'B' }],
    expenses: [],
    payments: [],
    ...overrides,
  };
}

describe('computeSettlementDigests', () => {
  it('splits an expense into creditor (+) and debtor (-)', () => {
    const d = computeSettlementDigests([
      trip({
        expenses: [
          {
            payer: 'A',
            amount: 100,
            splits: [
              { user: 'A', shareAmount: 50 },
              { user: 'B', shareAmount: 50 },
            ],
          },
        ],
      }),
    ]);
    expect(d.get('A')).toEqual([{ tripHashCode: 't1', tripName: 'Trip 1', balance: 50 }]);
    expect(d.get('B')).toEqual([{ tripHashCode: 't1', tripName: 'Trip 1', balance: -50 }]);
  });

  it('omits users whose balance is settled by registered payments', () => {
    const d = computeSettlementDigests([
      trip({
        expenses: [
          {
            payer: 'A',
            amount: 100,
            splits: [
              { user: 'A', shareAmount: 50 },
              { user: 'B', shareAmount: 50 },
            ],
          },
        ],
        payments: [{ from: 'B', to: 'A', amount: 50 }],
      }),
    ]);
    expect(d.size).toBe(0);
  });

  it('skips reminding a member who archived the trip', () => {
    const d = computeSettlementDigests([
      trip({
        members: [{ userId: 'A' }, { userId: 'B', archivedAt: new Date() }],
        expenses: [
          {
            payer: 'A',
            amount: 100,
            splits: [
              { user: 'A', shareAmount: 50 },
              { user: 'B', shareAmount: 50 },
            ],
          },
        ],
      }),
    ]);
    // A 仍被提醒（仍應收），B 已封存故不提醒
    expect(d.has('A')).toBe(true);
    expect(d.has('B')).toBe(false);
  });

  it('aggregates a user across multiple unsettled trips', () => {
    const d = computeSettlementDigests([
      trip({
        tripHashCode: 't1',
        tripName: 'Tokyo',
        expenses: [{ payer: 'A', amount: 100, splits: [{ user: 'B', shareAmount: 100 }] }],
      }),
      trip({
        tripHashCode: 't2',
        tripName: 'Osaka',
        expenses: [{ payer: 'A', amount: 60, splits: [{ user: 'B', shareAmount: 60 }] }],
      }),
    ]);
    expect(d.get('B')).toEqual([
      { tripHashCode: 't1', tripName: 'Tokyo', balance: -100 },
      { tripHashCode: 't2', tripName: 'Osaka', balance: -60 },
    ]);
  });

  it('treats sub-epsilon balances as settled', () => {
    const d = computeSettlementDigests([
      trip({
        expenses: [
          {
            payer: 'A',
            amount: 0.01,
            splits: [
              { user: 'A', shareAmount: 0.005 },
              { user: 'B', shareAmount: 0.005 },
            ],
          },
        ],
      }),
    ]);
    expect(d.size).toBe(0);
  });
});
