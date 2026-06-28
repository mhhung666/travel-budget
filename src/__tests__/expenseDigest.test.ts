import { describe, it, expect } from 'vitest';
import { computeExpenseDigests, type TripExpenseDigestInput } from '@/lib/expenseDigest';

function trip(overrides: Partial<TripExpenseDigestInput>): TripExpenseDigestInput {
  return {
    tripId: 't1',
    tripName: 'Trip 1',
    members: [{ userId: 'A' }, { userId: 'B' }],
    expenses: [],
    ...overrides,
  };
}

const exp = (createdBy: string | null, description = 'x', amount = 100, payerName = 'P') => ({
  createdBy,
  description,
  amount,
  payerName,
});

describe('computeExpenseDigests', () => {
  it("excludes the recipient's own additions", () => {
    const d = computeExpenseDigests([trip({ expenses: [exp('A', 'lunch', 200, 'Alice')] })]);
    // A 自己加的 → A 不收；B 收到
    expect(d.has('A')).toBe(false);
    expect(d.get('B')).toEqual([
      {
        tripId: 't1',
        tripName: 'Trip 1',
        expenses: [{ description: 'lunch', amount: 200, payerName: 'Alice' }],
      },
    ]);
  });

  it('includes expenses with null createdBy for everyone (legacy data)', () => {
    const d = computeExpenseDigests([trip({ expenses: [exp(null)] })]);
    expect(d.get('A')).toHaveLength(1);
    expect(d.get('B')).toHaveLength(1);
  });

  it('skips a member who archived the trip', () => {
    const d = computeExpenseDigests([
      trip({
        members: [{ userId: 'A' }, { userId: 'B', archivedAt: new Date() }],
        expenses: [exp('A')],
      }),
    ]);
    // 只有 B 會因為「非自己加」而合格，但 B 已封存 → 無人收
    expect(d.size).toBe(0);
  });

  it('aggregates a user across multiple trips', () => {
    const d = computeExpenseDigests([
      trip({
        tripId: 't1',
        tripName: 'Tokyo',
        members: [{ userId: 'A' }, { userId: 'B' }],
        expenses: [exp('A')],
      }),
      trip({
        tripId: 't2',
        tripName: 'Osaka',
        members: [{ userId: 'A' }, { userId: 'B' }],
        expenses: [exp('A')],
      }),
    ]);
    expect(d.get('B')).toHaveLength(2);
    expect(d.get('B')!.map((t) => t.tripName)).toEqual(['Tokyo', 'Osaka']);
  });

  it('omits a trip with no expenses', () => {
    const d = computeExpenseDigests([trip({ expenses: [] })]);
    expect(d.size).toBe(0);
  });
});
