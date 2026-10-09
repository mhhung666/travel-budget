import { expect, it } from 'vitest';
import { budgetV2Input, budgetContextV2Schema, mutationRequestV2Schema } from '@/api/contracts';
import { budgetForm, budgetValues, rebaseBudget } from './budgetForm';
const budget = { total: 120, categories: [{ category: 'food' as const, amount: 30 }] };
it('keeps raw text, treats zero/blank as removal and permits independent category totals', () => {
  expect(budgetForm(budget)).toEqual({ total: '120', categories: { food: '30' } });
  expect(budgetValues({ total: '000.00', categories: { food: '00200.01', other: '0' } })).toEqual({
    total: null,
    categories: [{ category: 'food', amount: 200.01 }],
  });
  expect(budgetValues({ total: '', categories: {} })).toEqual({ total: null, categories: [] });
});
it.each(['-1', '1.001', '1abc', '1e2', '1,000', 'Infinity', '1000000000.01'])(
  'rejects invalid raw input %s without clearing the limit',
  (value) => {
    expect(() => budgetValues({ total: value, categories: {} })).toThrow();
    expect(() => budgetValues({ total: '', categories: { food: value } })).toThrow();
  }
);
it('rebases only explicit edits, including category removal, preserving untouched Web values', () => {
  expect(
    rebaseBudget(
      budget,
      { total: '00120.00', categories: { food: '', other: '25' } },
      {
        total: 180,
        categories: [
          { category: 'food', amount: 60 },
          { category: 'shopping', amount: 40 },
        ],
      }
    )
  ).toEqual({ total: '180', categories: { food: '', shopping: '40', other: '25' } });
});
const input = {
  client_request_id: '11111111-1111-4111-8111-111111111111',
  expected_revision: 'a'.repeat(64),
  base_currency: 'USD',
  ...budget,
};
it('requires complete v2 replacement and rejects forged owners, duplicate categories, invalid cents and unsupported categories', () => {
  expect(budgetV2Input.safeParse(input).success).toBe(true);
  for (const body of [
    { ...input, actorId: 'a'.repeat(24) },
    { ...input, total: undefined },
    { ...input, total: 1.001 },
    { ...input, categories: [...budget.categories, ...budget.categories] },
    { ...input, categories: [{ category: 'unknown', amount: 1 }] },
  ])
    expect(budgetV2Input.safeParse(body).success).toBe(false);
});
it('receipt requires budget result and matching ledger, with no unrelated operation acceptance', () => {
  const receipt = {
    status: 'committed',
    operation: 'budget.set',
    resourceId: 'a'.repeat(24),
    ledger: { baseCurrency: 'USD', moneyScale: 2 },
    result: {
      tripId: 'a'.repeat(24),
      updated: true,
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
    },
  };
  expect(mutationRequestV2Schema.safeParse(receipt).success).toBe(true);
  expect(mutationRequestV2Schema.safeParse({ ...receipt, operation: 'trip.join' }).success).toBe(
    false
  );
  expect(
    mutationRequestV2Schema.safeParse({
      ...receipt,
      result: { ...receipt.result, ledger: { baseCurrency: 'TWD', moneyScale: 2 } },
    }).success
  ).toBe(false);
  expect(budgetContextV2Schema.safeParse({}).success).toBe(false);
});
