import { beforeEach, expect, it, vi } from 'vitest';
import { mobilePaymentContext, mobileWritePayment } from '@/lib/mobile/payments';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError } from '@/lib/mobile/http';
const h = vi.hoisted(() => ({
  member: vi.fn(),
  context: vi.fn(),
  revoke: vi.fn(),
  write: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('mongoose', async (original) => {
  const mongooseModule = await original<typeof import('mongoose')>();
  return { ...mongooseModule, default: { ...mongooseModule.default, connection: { db: {} } } };
});
vi.mock('@/lib/mobile/access', () => ({ requireTripMember: h.member }));
vi.mock('@/lib/paymentWrite', () => ({
  readPaymentContext: h.context,
  readPaymentRevokeContext: h.revoke,
  writePayment: h.write,
}));
vi.mock('@/lib/notify', () => ({ deliverPaymentNotification: h.deliver }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ JWT_SECRET: 'e4-test' }) }));
const trip = '111111111111111111111111',
  actor = '222222222222222222222222',
  payment = '333333333333333333333333';
// Native requests are v2: every write confirms the trip unit.
const body = {
  base_currency: 'TWD',
  client_request_id: '11111111-1111-4111-8111-111111111111',
  expected_revision: 'a'.repeat(64),
  from_id: actor,
  to_id: payment,
  amount: 20.01,
  note: ' external ',
};
const request = (value: unknown, method = 'POST') =>
  new Request('http://test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  h.member.mockReset();
  h.context.mockReset();
  h.revoke.mockReset();
  h.write.mockReset();
  h.member.mockResolvedValue(trip);
  h.write.mockResolvedValue({
    result: { tripId: trip, paymentId: payment, revision: 'a'.repeat(64) },
  });
});
it('membership refusal precedes parsing malformed write and exposes no context', async () => {
  h.member.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
  await expect(
    mobileWritePayment(new Request('http://test', { method: 'POST', body: 'invalid' }), actor, trip)
  ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  await expect(mobilePaymentContext(actor, trip)).rejects.toMatchObject({ status: 404 });
  expect(h.write).not.toHaveBeenCalled();
  expect(h.context).not.toHaveBeenCalled();
});
it('strict create body delegates normalized cents and post-commit delivery only to shared service', async () => {
  await mobileWritePayment(request(body), actor, trip);
  expect(h.write).toHaveBeenCalledWith(
    expect.anything(),
    actor,
    trip,
    'payment.create',
    { ...body, note: 'external' },
    'e4-test',
    undefined,
    h.deliver
  );
  await expect(
    mobileWritePayment(request({ ...body, unsupported: true }), actor, trip)
  ).rejects.toMatchObject({ status: 400 });
  expect(h.write).toHaveBeenCalledTimes(1);
});
it('delete body accepts only identity and delegates correct resource', async () => {
  const removal = {
    base_currency: body.base_currency,
    client_request_id: body.client_request_id,
    expected_revision: body.expected_revision,
  };
  await mobileWritePayment(request(removal, 'DELETE'), actor, trip, payment);
  expect(h.write).toHaveBeenCalledWith(
    expect.anything(),
    actor,
    trip,
    'payment.delete',
    removal,
    'e4-test',
    payment,
    h.deliver
  );
  await expect(
    mobileWritePayment(request(body, 'DELETE'), actor, trip, payment)
  ).rejects.toMatchObject({ status: 400 });
});
it.each(['SETTLEMENT_CHANGED', 'RESOURCE_CHANGED', 'RESOURCE_GONE', 'VALIDATION_ERROR'] as const)(
  'terminal %s maps to 409 for durable receipt lookup',
  async (code) => {
    h.write.mockRejectedValue(new TripEntryError(code));
    await expect(mobileWritePayment(request(body), actor, trip)).rejects.toMatchObject({
      status: 409,
      code,
    });
  }
);
it('revoked trip and missing payment have separate 404 codes', async () => {
  h.revoke.mockRejectedValue(new TripEntryError('RESOURCE_GONE'));
  await expect(mobilePaymentContext(actor, trip, payment)).rejects.toMatchObject({
    status: 404,
    code: 'RESOURCE_GONE',
  });
  h.revoke.mockRejectedValue(new TripWriteError('FORBIDDEN'));
  await expect(mobilePaymentContext(actor, trip, payment)).rejects.toMatchObject({
    status: 404,
    code: 'NOT_FOUND',
  });
});
it('malformed payment id rejects before read/body and a different valid trip id never aliases', async () => {
  await expect(mobilePaymentContext(actor, trip, 'not-id')).rejects.toMatchObject({ status: 404 });
  expect(h.revoke).not.toHaveBeenCalled();
  await mobilePaymentContext(actor, trip, payment);
  expect(h.revoke).toHaveBeenCalledWith(expect.anything(), actor, trip, payment, 'e4-test');
});
