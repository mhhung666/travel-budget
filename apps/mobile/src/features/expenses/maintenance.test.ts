import { expect, it, vi } from 'vitest';
import {
  expenseMutationResultSchema,
  mutationRequestSchema,
  type ExpenseEditContext,
} from '@travel-budget/contracts';
import { editChanges, editFields, prepareEdit, rebaseEditFields } from './maintenance';
const actor = '111111111111111111111111',
  peer = '222222222222222222222222',
  third = '333333333333333333333333';
const context: ExpenseEditContext = {
  expense: {
    id: peer,
    date: '2026-10-06',
    description: 'original',
    category: 'other',
    payerId: actor,
    payerName: 'Same',
    amount: 100,
    originalAmount: 400,
    currency: 'JPY',
    exchangeRate: 0.25,
    splits: [
      { userId: actor, displayName: 'Same', shareAmount: 80 },
      { userId: peer, displayName: 'Same', shareAmount: 20 },
    ],
  },
  category: 'legacy-category',
  revision: 'a'.repeat(64),
  options: {
    members: [actor, peer, third].map((id) => ({ id, displayName: 'Same' })),
    categories: ['food', 'other'],
  },
  capabilities: { basic: true, equal: false, reason: 'foreign' },
};
it('unchanged form sends nothing and one metadata change never resends historical accounting/category', () => {
  const fields = editFields(context);
  expect(editChanges(context, fields, 'basic')).toBeNull();
  const historical = { ...context, expense: { ...context.expense, description: ' original ' } };
  expect(editChanges(historical, editFields(historical), 'basic')).toBeNull();
  expect(editChanges(context, { ...fields, description: ' changed ' }, 'basic')).toEqual({
    mode: 'basic',
    changes: { description: 'changed' },
  });
});
it('basic whitelist rejects invalid dates/unknown new categories and permits explicit known replacement', () => {
  expect(() =>
    editChanges(context, { ...editFields(context), date: '2026-02-31' }, 'basic')
  ).toThrow();
  expect(() =>
    editChanges(context, { ...editFields(context), category: 'invented' }, 'basic')
  ).toThrow();
  expect(editChanges(context, { ...editFields(context), category: 'food' }, 'basic')).toEqual({
    mode: 'basic',
    changes: { category: 'food' },
  });
});
it('unsupported/invalid-member edits cannot silently convert to equal, preview must match input', () => {
  expect(() => editChanges(context, editFields(context), 'equal')).toThrow();
  const twd = {
    ...context,
    expense: { ...context.expense, currency: 'TWD', exchangeRate: 1, originalAmount: 100 },
    capabilities: { basic: true as const, equal: true, reason: null },
  };
  expect(() =>
    editChanges(
      twd,
      { ...editFields(twd), amountText: '0.01', memberIds: [actor, peer, third] },
      'equal',
      { amount: 100, splits: [] }
    )
  ).toThrow();
  const shares = [actor, peer, third].map((id, i) => ({
    userId: id,
    displayName: 'Same',
    shareAmount: i ? 0 : 0.01,
  }));
  expect(
    editChanges(
      twd,
      { ...editFields(twd), amountText: '0.01', memberIds: [actor, peer, third] },
      'equal',
      { amount: 0.01, splits: shares }
    )
  ).toMatchObject({
    mode: 'equal',
    changes: {
      original_amount: 0.01,
      payer_id: actor,
      splits: shares.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
    },
  });
});
it('changed context preserves input and never previews/sends automatically', async () => {
  const fresh = { ...context, revision: 'b'.repeat(64) };
  const request = vi.fn(async () => fresh);
  const fields = { ...editFields(context), description: 'mine' };
  expect(
    await prepareEdit(
      request as never,
      actor,
      peer,
      peer,
      context,
      fields,
      'basic',
      () => undefined
    )
  ).toEqual({ context: fresh, changes: null, preview: null });
  expect(fields.description).toBe('mine');
  expect(request).toHaveBeenCalledTimes(1);
});
it('member changes during preview invalidate it without accepting a newer revision', async () => {
  const twd = {
    ...context,
    expense: { ...context.expense, currency: 'TWD', exchangeRate: 1, originalAmount: 100 },
    capabilities: { basic: true as const, equal: true, reason: null },
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce(twd)
    .mockResolvedValueOnce({
      amount: 100,
      splits: [{ userId: actor, displayName: 'Same', shareAmount: 100 }],
    })
    .mockResolvedValueOnce({ ...twd, revision: 'b'.repeat(64) });
  const result = await prepareEdit(
    request as never,
    actor,
    peer,
    peer,
    twd,
    { ...editFields(twd), amountText: '100', memberIds: [actor] },
    'equal',
    () => undefined
  );
  expect(result.preview).toBeNull();
  expect(result.changes).toBeNull();
  expect(result.context.revision).toBe('b'.repeat(64));
  expect(request).toHaveBeenCalledTimes(3);
});
it('guard rejects a late read before it can confirm another account/revocation generation', async () => {
  const request = vi.fn(async () => context);
  const guard = vi.fn(() => {
    throw new Error('generation changed');
  });
  await expect(
    prepareEdit(request as never, actor, peer, peer, context, editFields(context), 'basic', guard)
  ).rejects.toThrow('generation changed');
});

it('maintenance receipt parsing retains expense identity and refuses ambiguous success payloads', () => {
  expect(expenseMutationResultSchema.safeParse({ tripId: actor, expenseId: peer }).success).toBe(
    false
  );
  expect(
    expenseMutationResultSchema.safeParse({
      tripId: actor,
      expenseId: peer,
      revision: 'a'.repeat(64),
      deleted: true,
    }).success
  ).toBe(false);
  const result = {
    status: 'committed' as const,
    operation: 'expense.delete' as const,
    resourceId: peer,
    result: { tripId: actor, expenseId: peer, deleted: true as const },
  };
  expect(mutationRequestSchema.parse(result)).toEqual(result);
  expect(mutationRequestSchema.safeParse({ ...result, operation: 'expense.update' }).success).toBe(
    false
  );
});

it('conflict rebase keeps only changed metadata across repeated conflicts and preserves raw categories', () => {
  const fresh = {
    ...context,
    revision: 'b'.repeat(64),
    category: 'another-legacy-category',
    expense: { ...context.expense, description: 'remote', date: '2026-10-07', originalAmount: 800 },
  };
  const input = { ...editFields(context), description: 'mine' };
  const rebased = rebaseEditFields(context, input, fresh);
  expect(rebased).toEqual({ ...editFields(fresh), description: 'mine' });
  expect(editChanges(fresh, rebased, 'basic')).toEqual({
    mode: 'basic',
    changes: { description: 'mine' },
  });
  const newer = { ...fresh, revision: 'c'.repeat(64), category: 'food' };
  const again = rebaseEditFields(fresh, rebased, newer);
  expect(editChanges(newer, again, 'basic')).toEqual({
    mode: 'basic',
    changes: { description: 'mine' },
  });
  expect(input).toEqual({ ...editFields(context), description: 'mine' });
});
it('explicit category/date edits survive review while unchanged description and accounting refresh', () => {
  const fresh = {
    ...context,
    expense: { ...context.expense, description: 'remote', originalAmount: 800 },
  };
  const rebased = rebaseEditFields(
    context,
    {
      ...editFields(context),
      category: 'food',
      date: '2026-10-08',
    },
    fresh
  );
  expect(rebased).toEqual({ ...editFields(fresh), category: 'food', date: '2026-10-08' });
  expect(editChanges(fresh, rebased, 'basic')).toEqual({
    mode: 'basic',
    changes: { category: 'food', date: '2026-10-08' },
  });
});
it('unchanged equal inputs follow latest accounting; explicitly edited values still require validation', () => {
  const fresh = {
    ...context,
    expense: {
      ...context.expense,
      originalAmount: 800,
      payerId: third,
      splits: [{ userId: third, displayName: 'Third', shareAmount: 200 }],
    },
  };
  expect(
    rebaseEditFields(
      context,
      {
        ...editFields(context),
        amountText: '400.00',
        memberIds: [peer, actor],
      },
      fresh
    )
  ).toEqual(editFields(fresh));
  const input = {
    ...editFields(context),
    amountText: 'invalid',
    payerId: peer,
    memberIds: [actor],
  };
  expect(rebaseEditFields(context, input, fresh)).toEqual(input);
});
it('whitespace-only or reverted edits do not overwrite remote metadata', () => {
  const fresh = { ...context, expense: { ...context.expense, description: 'remote' } };
  const fields = rebaseEditFields(
    context,
    { ...editFields(context), description: ' original ' },
    fresh
  );
  expect(fields.description).toBe('remote');
  expect(editChanges(fresh, fields, 'basic')).toBeNull();
});

const foreignEqual: ExpenseEditContext = {
  ...context,
  category: 'food',
  capabilities: { basic: true, equal: false, recalculate: true, reason: 'foreign' },
  options: {
    ...context.options,
    supportedCurrencies: ['TWD', 'JPY', 'USD'],
    currencySettings: { default_currency: 'USD', currencies: [{ code: 'JPY', rate: 9 }] },
  },
  expense: {
    ...context.expense,
    originalAmount: 100,
    exchangeRate: 0.2156789012345,
    amount: 21.57,
    splits: [
      { userId: actor, displayName: 'Same', shareAmount: 10.79 },
      { userId: peer, displayName: 'Same', shareAmount: 10.78 },
    ],
  },
};
const foreignPreview = {
  amount: 21.57,
  originalAmount: 100,
  currency: 'JPY',
  exchangeRate: 0.2156789012345,
  splits: foreignEqual.expense.splits.map((s) => ({ ...s, userId: s.userId! })),
};
it('editing starts from historical currency/rate even when current trip settings differ', () => {
  const fields = editFields(foreignEqual);
  expect(fields).toMatchObject({ currency: 'JPY', rateText: '0.2156789012345', amountText: '100' });
  expect(editChanges(foreignEqual, { ...fields, description: 'basic' }, 'basic')).toEqual({
    mode: 'basic',
    changes: { description: 'basic' },
  });
  expect(editChanges(foreignEqual, fields, 'equal', foreignPreview)).toMatchObject({
    mode: 'equal',
    changes: { currency: 'JPY', exchange_rate: 0.2156789012345, original_amount: 100 },
  });
});
it.each([
  { amountText: '101' },
  { currency: 'USD' },
  { rateText: '0.2156789012346' },
  { payerId: third, memberIds: [actor, third] },
  { rateText: '0' },
  { rateText: 'NaN' },
  { currency: 'ZZZ' },
  { memberIds: [actor, actor] },
])('rejects stale foreign preview or invalid input: %j', (patch) => {
  expect(() =>
    editChanges(foreignEqual, { ...editFields(foreignEqual), ...patch }, 'equal', foreignPreview)
  ).toThrow();
});
it('rejects malformed preview totals and TWD rate changes independently', () => {
  expect(() =>
    editChanges(foreignEqual, editFields(foreignEqual), 'equal', { ...foreignPreview, amount: 20 })
  ).toThrow();
  expect(() =>
    editChanges(
      foreignEqual,
      { ...editFields(foreignEqual), currency: 'TWD', rateText: '2' },
      'equal',
      { amount: 100, splits: [{ userId: actor, displayName: 'A', shareAmount: 100 }] }
    )
  ).toThrow();
});
it('preview sends precise historical rate and foreign amount, then rechecks the expense/member revision', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(foreignEqual)
    .mockResolvedValueOnce(foreignPreview)
    .mockResolvedValueOnce(foreignEqual);
  const next = await prepareEdit(
    request as never,
    actor,
    peer,
    peer,
    foreignEqual,
    editFields(foreignEqual),
    'equal',
    () => undefined
  );
  expect(request.mock.calls[1][3].body).toEqual({
    amount: 100,
    currency: 'JPY',
    exchange_rate: 0.2156789012345,
    member_ids: [actor, peer],
  });
  expect(next.changes).toMatchObject({
    changes: { currency: 'JPY', exchange_rate: 0.2156789012345 },
  });
});
it.each([
  [0.01, '1e-12', 0],
  [50000000000, '0.02', 1000000000],
  [0.01, '1e11', 1000000000],
])('keeps original amount/rate for small and large conversion %s × %s', (original, rate, total) => {
  const fields = {
    ...editFields(foreignEqual),
    amountText: String(original),
    rateText: String(rate),
    memberIds: [actor],
  };
  const preview = {
    originalAmount: Number(original),
    currency: 'JPY',
    exchangeRate: Number(rate),
    amount: Number(total),
    splits: [{ userId: actor, displayName: 'A', shareAmount: Number(total) }],
  };
  expect(editChanges(foreignEqual, fields, 'equal', preview)).toMatchObject({
    changes: { original_amount: Number(original), exchange_rate: Number(rate) },
  });
});
it('conflict review takes remote currency/rate only when not edited, and keeps explicit currency/rate edits', () => {
  const latest = {
    ...foreignEqual,
    revision: 'b'.repeat(64),
    expense: {
      ...foreignEqual.expense,
      currency: 'USD',
      exchangeRate: 30,
      originalAmount: 20,
      amount: 600,
    },
  };
  expect(rebaseEditFields(foreignEqual, editFields(foreignEqual), latest)).toEqual(
    editFields(latest)
  );
  const mine = { ...editFields(foreignEqual), currency: 'TWD', rateText: '1', amountText: '120' };
  expect(rebaseEditFields(foreignEqual, mine, latest)).toMatchObject({
    currency: 'TWD',
    rateText: '1',
    amountText: '120',
  });
  expect(
    rebaseEditFields(foreignEqual, { ...editFields(foreignEqual), rateText: '0.5' }, latest)
  ).toMatchObject({
    currency: 'JPY',
    rateText: '0.5',
    amountText: '20',
  });
});
