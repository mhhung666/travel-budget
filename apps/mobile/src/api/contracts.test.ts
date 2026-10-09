import * as shared from '@travel-budget/contracts';
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
  expenseOptionsSchema,
  expensePreviewInput,
  expensePreviewSchema,
  expenseCreateInput,
  expenseRequestSchema,
  expenseEditContextSchema,
  isPositiveCentAmount,
  isCentShare,
  MAX_EXPENSE_AMOUNT,
  responseSchema,
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
  it('publishes only the v2 routes the client sends to', () => {
    expect(contract.servers).toEqual([{ url: '/api' }]);
    expect(Object.keys(contract.paths).every((path) => path.startsWith('/v2/'))).toBe(true);
  });
  // What the client sends and parses at the HTTP boundary, against the published v2 schema.
  for (const [name, schema] of Object.entries({
    User: userSchema,
    Session: sessionSchema,
    V2Trips: responseSchema(tripsSchema, 2),
    V2Landing: responseSchema(landingSchema, 2),
    V2Expenses: responseSchema(expensesSchema, 2),
    V2ExpenseDetail: responseSchema(expenseDetailSchema, 2),
    V2Settlement: responseSchema(settlementSchema, 2),
    V2ExpenseOptions: responseSchema(expenseOptionsSchema, 2),
    V2ExpensePreview: responseSchema(expensePreviewSchema, 2),
    V2ExpenseRequest: responseSchema(expenseRequestSchema, 2),
    V2ExpenseEditContext: responseSchema(expenseEditContextSchema, 2),
    V2ExpensePreviewInput: shared.expensePreviewV2Input,
    V2ExpenseCreateInput: shared.expenseCreateV2Input,
    V2ExpenseUpdateInput: shared.expenseUpdateV2Input,
  })) {
    it(`keeps ${name} fields in sync`, () => {
      const actual = z.toJSONSchema(schema, { io: name.endsWith('Input') ? 'input' : 'output' });
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

const key = '017fd635-8dc2-41c1-bf6a-ecbe40f18f90';
const createBody = {
  client_request_id: key,
  payer_id: id,
  original_amount: 100,
  currency: 'TWD',
  exchange_rate: 1,
  description: 'Dinner',
  category: 'food',
  date: '2026-10-03',
  splits: [{ user_id: id, share_amount: 100 }],
};
describe('online expense entry payloads', () => {
  it('accepts amounts on the cent grid up to the limit and nothing else', () => {
    for (const ok of [0.01, 0.1, 1.15, 33.34, 12345678.9, 999_999_999.99, MAX_EXPENSE_AMOUNT])
      expect(isPositiveCentAmount(ok), String(ok)).toBe(true);
    for (const bad of [0, -1, 0.001, 1.005, 33.345, 0.1 + 0.2, NaN, Infinity, 1e15, 1e21])
      expect(isPositiveCentAmount(bad), String(bad)).toBe(false);
    // A share may be zero: 0.01 split three ways gives two members nothing.
    expect(isCentShare(0)).toBe(true);
    expect(isCentShare(-0.01)).toBe(false);
    expect(isCentShare(0.005)).toBe(false);
    expect(isCentShare(MAX_EXPENSE_AMOUNT)).toBe(true);
  });

  // The backend's cent rounding turns 10_000_000_000_000 into 10_000_000_000_000.01, so larger
  // amounts must be refused at the contract instead of drifting between preview, storage and reply.
  it('refuses amounts and shares above the limit', () => {
    expect(MAX_EXPENSE_AMOUNT).toBe(1_000_000_000);
    for (const bad of [1_000_000_000.01, 10_000_000_000_000, 90_071_992_547_409.91]) {
      expect(isPositiveCentAmount(bad), String(bad)).toBe(false);
      expect(isCentShare(bad), String(bad)).toBe(false);
      expect(expensePreviewInput.safeParse({ amount: bad, member_ids: [id] }).success).toBe(false);
      expect(expenseCreateInput.safeParse({ ...createBody, original_amount: bad }).success).toBe(
        false
      );
      expect(
        expenseCreateInput.safeParse({
          ...createBody,
          splits: [{ user_id: id, share_amount: bad }],
        }).success
      ).toBe(false);
    }
    const largest = {
      ...createBody,
      original_amount: MAX_EXPENSE_AMOUNT,
      splits: [{ user_id: id, share_amount: MAX_EXPENSE_AMOUNT }],
    };
    expect(expenseCreateInput.parse(largest)).toEqual(largest);
    expect(
      expensePreviewInput.safeParse({ amount: MAX_EXPENSE_AMOUNT, member_ids: [id] }).success
    ).toBe(true);
  });

  it('trims the description and fixes the supported scope', () => {
    expect(expenseCreateInput.parse({ ...createBody, description: '  Dinner  ' })).toEqual(
      createBody
    );
    for (const bad of [
      { currency: 'jpy' },
      { exchange_rate: 30 },
      { client_request_id: 'abc' },
      { client_request_id: undefined },
      { category: 'games' },
      { date: '2026-02-30' },
      { date: '2026-10-03T00:00:00Z' },
      { description: '   ' },
      { description: 'x'.repeat(201) },
      { original_amount: 10.005 },
      { original_amount: '100' },
      { splits: [] },
      { splits: [createBody.splits[0], createBody.splits[0]] },
      { splits: [{ ...createBody.splits[0], note: 'x' }] },
      { splits: [{ user_id: id, share_amount: -1 }] },
      { attachments: [] },
      { tags: [] },
      { itinerary_day_ids: [] },
      { unknown: true },
    ])
      expect(
        expenseCreateInput.safeParse({ ...createBody, ...bad }).success,
        JSON.stringify(bad)
      ).toBe(false);
  });

  it('requires unique members for a preview', () => {
    expect(expensePreviewInput.safeParse({ amount: 100, member_ids: [id] }).success).toBe(true);
    for (const bad of [
      { amount: 100, member_ids: [] },
      { amount: 100, member_ids: [id, id] },
      { amount: 0, member_ids: [id] },
      { amount: 100, member_ids: [id], currency: 'TWD' },
    ])
      expect(expensePreviewInput.safeParse(bad).success).toBe(false);
  });

  it('describes the outcome of a request lookup as a closed set', () => {
    expect(expenseRequestSchema.parse({ status: 'not_found' })).toEqual({ status: 'not_found' });
    const expenseDetail = { ...expense, exchangeRate: 1, splits: [] };
    expect(expenseRequestSchema.parse({ status: 'committed', expense: expenseDetail }).status).toBe(
      'committed'
    );
    for (const bad of [{ status: 'committed' }, { status: 'pending' }, {}])
      expect(expenseRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    // Like every response schema, additive fields from a newer server are ignored.
    expect(expenseRequestSchema.parse({ status: 'not_found', futureField: 1 })).toEqual({
      status: 'not_found',
    });
  });

  it('lists members and categories for the form', () => {
    expect(
      expenseOptionsSchema.parse({
        members: [{ id, displayName: 'Amy' }],
        categories: ['food', 'other'],
      })
    ).toEqual({ members: [{ id, displayName: 'Amy' }], categories: ['food', 'other'] });
    expect(expenseOptionsSchema.safeParse({ members: [], categories: ['games'] }).success).toBe(
      false
    );
    expect(
      expensePreviewSchema.safeParse({
        amount: 100,
        splits: [{ userId: id, displayName: 'Amy', shareAmount: 100 }],
      }).success
    ).toBe(true);
  });
});

it('reads optional virtual flags while accepting old expense responses', () => {
  const old = {
    id: '507f191e810c19729de860ea',
    date: '2026-10-07',
    description: 'TEST',
    category: 'food',
    payerId: '507f191e810c19729de860ea',
    payerName: 'Amy',
    amount: 1,
    originalAmount: 1,
    currency: 'TWD',
    exchangeRate: 1,
    splits: [{ userId: null, displayName: '', shareAmount: 1 }],
  };
  expect(expenseDetailSchema.parse(old)).toEqual(old);
  expect(
    expenseDetailSchema.parse({
      ...old,
      payerIsVirtual: true,
      splits: [{ ...old.splits[0], isVirtual: false }],
    })
  ).toMatchObject({ payerIsVirtual: true, splits: [{ isVirtual: false }] });
  expect(expenseDetailSchema.safeParse({ ...old, payerIsVirtual: 'yes' }).success).toBe(false);
});

it('G1b names are bounded and receipts cannot masquerade as another operation', async () => {
  const { virtualMemberCreateInput, memberMutationResultSchema, mutationRequestSchema } =
    await import('@travel-budget/contracts');
  const tripId = 'a'.repeat(24),
    memberId = 'b'.repeat(24),
    revision = 'c'.repeat(64);
  const identity = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: revision,
  };
  expect(
    virtualMemberCreateInput.parse({ ...identity, display_name: ' Alice ' }).display_name
  ).toBe('Alice');
  for (const display_name of ['', '   ', 'x'.repeat(201)])
    expect(virtualMemberCreateInput.safeParse({ ...identity, display_name }).success).toBe(false);
  expect(
    virtualMemberCreateInput.safeParse({ ...identity, display_name: 'Alice', role: 'admin' })
      .success
  ).toBe(false);
  const result = memberMutationResultSchema.parse({ tripId, memberId, revision });
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'member.create',
      resourceId: memberId,
      result,
    }).success
  ).toBe(true);
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'member.rename',
      resourceId: tripId,
      result,
    }).success
  ).toBe(false);
  expect(
    mutationRequestSchema.safeParse({
      status: 'committed',
      operation: 'trip.update',
      resourceId: tripId,
      result,
    }).success
  ).toBe(false);
});
it('G1c inputs preserve role target IDs and reject private fields; exit results match the operation', async () => {
  const { tripAccessInput, tripAccessResultSchema, mutationRequestSchema } =
    await import('@travel-budget/contracts');
  const identity = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: 'a'.repeat(64),
  };
  expect(
    tripAccessInput.parse({
      ...identity,
      action: 'role',
      member_id: 'ABCDEF'.repeat(4),
      role: 'admin',
    })
  ).toMatchObject({ member_id: 'abcdef'.repeat(4) });
  expect(
    tripAccessInput.safeParse({
      ...identity,
      action: 'remove',
      member_id: 'b'.repeat(24),
      password: 'secret',
    }).success
  ).toBe(false);
  expect(
    tripAccessResultSchema.safeParse({ tripId: 'b'.repeat(24), action: 'role', exited: true })
      .success
  ).toBe(false);
  expect(
    tripAccessResultSchema.safeParse({ tripId: 'b'.repeat(24), action: 'delete', exited: false })
      .success
  ).toBe(false);
  const receipt = {
    status: 'committed',
    operation: 'trip.access',
    resourceId: 'b'.repeat(24),
    result: { tripId: 'b'.repeat(24), action: 'delete', exited: true },
  };
  expect(mutationRequestSchema.safeParse(receipt).success).toBe(true);
  expect(mutationRequestSchema.safeParse({ ...receipt, operation: 'trip.create' }).success).toBe(
    false
  );
});

describe('G2c update compatibility', () => {
  const { expenseUpdateInput } = shared;
  const legacy = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: 'a'.repeat(64),
    mode: 'equal',
    changes: {
      original_amount: 100,
      payer_id: '111111111111111111111111',
      splits: [{ user_id: '111111111111111111111111', share_amount: 100 }],
    },
  };
  it('does not normalize or rewrite frozen legacy TWD bodies', () => {
    expect(expenseUpdateInput.parse(legacy)).toEqual(legacy);
    expect(
      expenseUpdateInput.safeParse({
        ...legacy,
        changes: { ...legacy.changes, original_amount: 1000000000.01 },
      }).success
    ).toBe(false);
    expect(
      expenseUpdateInput.parse({
        ...legacy,
        changes: {
          ...legacy.changes,
          original_amount: 50000000000,
          currency: 'JPY',
          exchange_rate: 0.02,
        },
      })
    ).toMatchObject({
      changes: { original_amount: 50000000000, exchange_rate: 0.02 },
    });
  });
  it.each([
    { currency: 'JPY' },
    { exchange_rate: 0.2 },
    { currency: 'TWD', exchange_rate: 2 },
    { currency: 'JPY', exchange_rate: 0 },
    { currency: 'JPY', exchange_rate: Infinity },
    { currency: 'jpy', exchange_rate: 0.2 },
    { currency: 'JPY', exchange_rate: 0.2, tags: [] },
    { original_amount: 0 },
    { original_amount: 1.234 },
  ])('rejects partial/invalid currency/rate or unsupported update fields %j', (patch) => {
    expect(
      expenseUpdateInput.safeParse({ ...legacy, changes: { ...legacy.changes, ...patch } }).success
    ).toBe(false);
  });
});
