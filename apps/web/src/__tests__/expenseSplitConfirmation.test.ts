// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { expenseCreateV2Input, expenseUpdateV2Input } from '@travel-budget/contracts';
import { confirmedExpenseShares } from '@/lib/expenseSplitConfirmation';
import { authorizeLedger, withLedgerV2 } from '@/lib/ledger';
const ids = ['a', 'b', 'c'].map((c) => c.repeat(24));
const members = ids.map((id) => ({ id }));
const body = {
  base_currency: 'TWD',
  client_request_id: '017fd635-8dc2-41c1-bf6a-ecbe40f18f90',
  payer_id: ids[0],
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Dinner',
  category: 'food',
  date: '2026-10-09',
  splits: ids.map((user_id, i) => ({ user_id, share_amount: [16.67, 33.33, 50][i] })),
  split: { mode: 'shares' as const, values: [1, 2, 3] },
};
const check = (input = body, people = members, base = 'TWD') =>
  withLedgerV2(() => {
    authorizeLedger({ baseCurrency: base });
    return confirmedExpenseShares(input, people);
  });
describe('confirmed advanced shares', () => {
  it('maps values by submitted IDs, regardless of confirmation order', () => {
    expect(check()).toEqual(Object.fromEntries(ids.map((id, i) => [id, [16.67, 33.33, 50][i]])));
    expect(
      check({
        ...body,
        splits: [...body.splits].reverse(),
        split: { mode: 'shares', values: [3, 2, 1] },
      })
    ).toEqual(check());
  });
  it('does not repair a one-cent confirmation discrepancy or an altered split intent', () => {
    expect(
      check({
        ...body,
        splits: body.splits.map((s, i) => ({
          ...s,
          share_amount: s.share_amount + (i === 0 ? 0.01 : i === 1 ? -0.01 : 0),
        })),
      })
    ).toBeNull();
    expect(check({ ...body, split: { mode: 'shares', values: [3, 2, 1] } })).toBeNull();
  });
  it('rejects missing participants and payer even when their amount is zero', () => {
    expect(check(body, members.slice(1))).toBeNull();
    expect(check({ ...body, payer_id: 'd'.repeat(24) })).toBeNull();
  });
  it.each([
    { mode: 'shares', values: [0, 0, 0] },
    { mode: 'shares', values: [1, 2] },
    { mode: 'percent', values: [33.333, 33.333, 33.334] },
    { mode: 'amount', values: ['20', null, null] },
    { mode: 'equal', values: [] },
  ])('rejects malformed create and edit intent: %j', (split) => {
    expect(expenseCreateV2Input.safeParse({ ...body, split }).success).toBe(false);
    expect(
      expenseUpdateV2Input.safeParse({
        base_currency: 'TWD',
        client_request_id: body.client_request_id,
        expected_revision: 'a'.repeat(64),
        mode: 'split',
        changes: {
          original_amount: 100,
          currency: 'TWD',
          exchange_rate: 1,
          payer_id: ids[0],
          splits: body.splits,
          split,
        },
      }).success
    ).toBe(false);
  });
  it('requires explicit mode for editing; basic cannot carry or discard accounting fields', () => {
    const { base_currency, client_request_id, description, category, date, ...changes } = body;
    const identity = { base_currency, client_request_id, expected_revision: 'a'.repeat(64) };
    expect(expenseUpdateV2Input.safeParse({ ...identity, mode: 'split', changes }).success).toBe(
      true
    );
    expect(expenseUpdateV2Input.safeParse({ ...identity, mode: 'basic', changes }).success).toBe(
      false
    );
    expect(expenseUpdateV2Input.safeParse({ ...identity, mode: 'equal', changes }).success).toBe(
      false
    );
    const basic = { ...identity, mode: 'basic', changes: { description, category, date } };
    expect(expenseUpdateV2Input.parse(basic)).toEqual(basic);
  });
});
