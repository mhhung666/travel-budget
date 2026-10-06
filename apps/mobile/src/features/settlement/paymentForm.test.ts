import { expect, it, vi } from 'vitest';
import {
  mutationRequestSchema,
  paymentFieldsSchema,
  type PaymentContext,
  type PaymentRevokeContext,
} from '@travel-budget/contracts';
import {
  paymentFields,
  paymentInput,
  paymentSuggestion,
  preparePayment,
  preparePaymentRevocation,
} from './paymentForm';
const a = '111111111111111111111111',
  b = '222222222222222222222222',
  trip = '333333333333333333333333';
const context: PaymentContext = {
  members: [
    { id: a, displayName: 'Same' },
    { id: b, displayName: 'Same' },
  ],
  settlementRevision: 'a'.repeat(64),
  settlement: {
    status: 'outstanding',
    totalExpenses: 100,
    balances: [],
    payments: [],
    suggestedTransfers: [{ fromId: a, toId: b, fromName: 'Same', toName: 'Same', amount: 50 }],
  },
};
const fields = paymentFields(context, { amountText: '20.01', note: ' note ' });
it('prefills id-based parties and allows partial, excess, manual and same-name members', () => {
  expect(paymentInput(context, fields)).toEqual({
    from_id: a,
    to_id: b,
    amount: 20.01,
    note: 'note',
  });
  expect(paymentSuggestion(context, fields)).toBe(50);
  expect(paymentInput(context, { ...fields, amountText: '1000000000.00' }).amount).toBe(1e9);
  expect(paymentSuggestion(context, { ...fields, fromId: b, toId: a })).toBeNull();
  expect(paymentInput(context, { ...fields, fromId: b, toId: a }).amount).toBe(20.01);
});
it.each(['0', '-1', '0.001', '1e2', '1000000000.01', 'Infinity'])(
  'invalid amount %s never reaches confirmation',
  (amountText) => {
    expect(() => paymentInput(context, { ...fields, amountText })).toThrow();
  }
);
it('current parties, distinct ids, cent precision, note limit and strict fields enforced by shared schema', () => {
  expect(() => paymentInput(context, { ...fields, toId: a })).toThrow();
  expect(() => paymentInput(context, { ...fields, toId: trip })).toThrow();
  expect(() => paymentInput(context, { ...fields, note: 'a'.repeat(201) })).toThrow();
  expect(
    paymentFieldsSchema.safeParse({ from_id: a.toUpperCase(), to_id: a, amount: 1 }).success
  ).toBe(false);
  expect(paymentFieldsSchema.safeParse({ from_id: a, to_id: b, amount: 1.001 }).success).toBe(
    false
  );
  expect(
    paymentFieldsSchema.safeParse({ from_id: a, to_id: b, amount: 1, currency: 'USD' }).success
  ).toBe(false);
});
it('fresh context conflict preserves exact user input without auto-confirm or write', async () => {
  const latest = { ...context, settlementRevision: 'b'.repeat(64) };
  const request = vi.fn(async () => latest);
  const before = structuredClone(fields);
  expect(await preparePayment(request as never, a, trip, context, fields, vi.fn())).toEqual({
    current: latest,
    body: null,
  });
  expect(fields).toEqual(before);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    a,
    `/trips/${trip}/payment-context`,
    expect.anything(),
    expect.objectContaining({ beforeSend: expect.any(Function) })
  );
});
it('unchanged fresh context prepares immutable body and synchronous guard rejects late response', async () => {
  const request = vi.fn(async () => context);
  expect((await preparePayment(request as never, a, trip, context, fields, vi.fn())).body).toEqual({
    ...paymentInput(context, fields),
    expected_revision: context.settlementRevision,
  });
  await expect(
    preparePayment(request as never, a, trip, context, fields, () => {
      throw new Error('revoked');
    })
  ).rejects.toThrow('revoked');
});
it('revoking a claimed virtual identity requires fresh revision and a second confirmation', async () => {
  const old: PaymentRevokeContext = {
    payment: {
      id: trip,
      fromId: a,
      toId: b,
      fromName: 'Same',
      toName: 'Same',
      amount: 20,
      note: '',
      createdAt: '2026-10-06T00:00:00.000Z',
    },
    revision: 'a'.repeat(64),
  };
  const current = { ...old, revision: 'b'.repeat(64), payment: { ...old.payment, fromId: trip } };
  const request = vi.fn(async () => current);
  expect(
    (await preparePaymentRevocation(request as never, a, trip, trip, old, vi.fn())).body
  ).toBeNull();
  expect(
    (await preparePaymentRevocation(request as never, a, trip, trip, current, vi.fn())).body
  ).toEqual({ expected_revision: current.revision });
});
it('payment receipt outcome must match operation/resource and cannot masquerade as trip/expense', () => {
  const valid = {
    status: 'committed',
    operation: 'payment.create',
    resourceId: trip,
    result: { tripId: a, paymentId: trip, revision: 'a'.repeat(64) },
  };
  expect(mutationRequestSchema.safeParse(valid).success).toBe(true);
  expect(mutationRequestSchema.safeParse({ ...valid, operation: 'trip.create' }).success).toBe(
    false
  );
  expect(mutationRequestSchema.safeParse({ ...valid, operation: 'expense.update' }).success).toBe(
    false
  );
  expect(
    mutationRequestSchema.safeParse({
      ...valid,
      result: { tripId: a, paymentId: trip, deleted: true },
    }).success
  ).toBe(false);
  expect(mutationRequestSchema.safeParse({ ...valid, resourceId: b }).success).toBe(false);
});
