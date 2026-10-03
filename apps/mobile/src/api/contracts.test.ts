import contract from '@travel-budget/contracts/openapi.json';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  userSchema,
  sessionSchema,
  tripsSchema,
  landingSchema,
  expensesSchema,
  expenseDetailSchema,
  settlementSchema,
} from './contracts';
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalize(child)])
    );
    if (Array.isArray(result.type)) {
      result.anyOf = result.type.map((type) => ({ type }));
      delete result.type;
    }
    return result;
  }
  return value;
}
describe('published backend contract', () => {
  for (const [name, schema] of Object.entries({
    User: userSchema,
    Session: sessionSchema,
    Trips: tripsSchema,
    Landing: landingSchema,
    Expenses: expensesSchema,
    ExpenseDetail: expenseDetailSchema,
    Settlement: settlementSchema,
  })) {
    it(`keeps ${name} response fields in sync`, () => {
      const actual = z.toJSONSchema(schema);
      delete actual.$schema;
      const expected = normalize(
        contract.components.schemas[name as keyof typeof contract.components.schemas]
      );
      if (!expected || typeof expected !== 'object') throw new Error('Missing contract schema');
      expect(normalize(actual)).toMatchObject(expected);
    });
  }
});

const id = '507f191e810c19729de860ea';
const expense = {
  id,
  date: '2026-10-02',
  description: 'Lunch',
  category: 'food' as const,
  payerId: id,
  payerName: 'Amy',
  amount: 100,
  originalAmount: 3000,
  currency: 'JPY',
};
describe('expense and settlement payloads', () => {
  it('accepts members whose reference no longer resolves and ignores additive fields', () => {
    const page = expensesSchema.parse({
      items: [{ ...expense, payerId: null, payerName: '', futureField: 1 }],
      nextCursor: '1.2.3',
    });
    expect(page.items[0]).toEqual({ ...expense, payerId: null, payerName: '' });
  });
  it('rejects unknown categories, malformed ids and non-date dates', () => {
    for (const bad of [
      { ...expense, category: 'mystery' },
      { ...expense, id: 'abc' },
      { ...expense, date: '2026-02-30' },
      { ...expense, amount: '100' },
    ])
      expect(expensesSchema.safeParse({ items: [bad], nextCursor: null }).success).toBe(false);
  });
  it('requires split details on the expense detail only', () => {
    expect(expenseDetailSchema.safeParse({ ...expense, exchangeRate: 0.0333 }).success).toBe(false);
    expect(
      expenseDetailSchema.safeParse({
        ...expense,
        exchangeRate: 0.0333,
        splits: [{ userId: null, displayName: '', shareAmount: 100 }],
      }).success
    ).toBe(true);
  });
  it('distinguishes the three settlement states and rejects anything else', () => {
    const base = { totalExpenses: 0, balances: [], suggestedTransfers: [], payments: [] };
    for (const status of ['empty', 'settled', 'outstanding'])
      expect(settlementSchema.safeParse({ ...base, status }).success).toBe(true);
    expect(settlementSchema.safeParse({ ...base, status: 'paid' }).success).toBe(false);
  });
});
