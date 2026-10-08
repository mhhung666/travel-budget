import { beforeEach, expect, it, vi } from 'vitest';
import { mobileTripMembers, mobileManageMember } from '@/lib/mobile/members';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError } from '@/lib/mobile/http';
const h = vi.hoisted(() => ({ member: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('mongoose', async (original) => {
  const mongooseModule = await original<typeof import('mongoose')>();
  return { ...mongooseModule, default: { ...mongooseModule.default, connection: { db: {} } } };
});
vi.mock('@/lib/mobile/access', () => ({ requireTripMember: h.member }));
vi.mock('@/lib/memberManagement', async (original) => ({
  ...(await original<typeof import('@/lib/memberManagement')>()),
  readTripMembers: h.read,
  manageMember: h.write,
}));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ JWT_SECRET: 'g1-test' }) }));
const actor = 'a'.repeat(24),
  trip = 'b'.repeat(24),
  identity = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    expected_revision: 'c'.repeat(64),
  };
const request = (body: unknown, type = 'application/json') =>
  new Request('http://test', {
    method: 'PATCH',
    headers: { 'content-type': type },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  h.member.mockResolvedValue(trip);
  h.write.mockResolvedValue({ tripId: trip, revision: 'd'.repeat(64) });
});
it('membership is checked before parsing malformed input or exposing private roster', async () => {
  h.member.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
  await expect(
    mobileManageMember(
      new Request('http://test', { method: 'PATCH', body: 'invalid' }),
      actor,
      trip,
      undefined
    )
  ).rejects.toMatchObject({ status: 404 });
  await expect(mobileTripMembers(actor, trip)).rejects.toMatchObject({ status: 404 });
  expect(h.write).not.toHaveBeenCalled();
  expect(h.read).not.toHaveBeenCalled();
});
it('strict normalized input and authenticated actor delegate to common service', async () => {
  await mobileManageMember(request({ ...identity, display_name: ' New ' }), actor, trip, undefined);
  expect(h.write).toHaveBeenCalledWith(
    expect.anything(),
    actor,
    trip,
    'member.create',
    { ...identity, display_name: 'New' },
    'g1-test',
    undefined
  );
  await mobileManageMember(
    request({ ...identity, display_name: 'Rename' }),
    actor,
    trip,
    'd'.repeat(24)
  );
  expect(h.write.mock.calls[1][3]).toBe('member.rename');
  expect(h.write.mock.calls[1][6]).toBe('d'.repeat(24));
  expect(h.write.mock.calls[1][4]).toEqual({ ...identity, display_name: 'Rename' });
});
it.each([
  { ...identity, display_name: 'ok', budget: 100 },
  { ...identity, display_name: '   ' },
  { ...identity, display_name: 'x'.repeat(201) },
  { ...identity, display_name: 'ok', actor_id: actor },
])('unknown, empty or invalid edit is rejected before writing', async (body) => {
  await expect(mobileManageMember(request(body), actor, trip, undefined)).rejects.toMatchObject({
    status: 400,
  });
  expect(h.write).not.toHaveBeenCalled();
});
it.each([
  [new TripEntryError('FORBIDDEN'), 403, 'FORBIDDEN'],
  [new TripWriteError('FORBIDDEN'), 404, 'NOT_FOUND'],
  [new TripEntryError('RESOURCE_CHANGED'), 409, 'RESOURCE_CHANGED'],
  [new TripEntryError('BUSY'), 429, 'BUSY'],
])(
  'maps service refusal without confusing lost admin with lost membership',
  async (error, status, code) => {
    h.write.mockRejectedValueOnce(error);
    await expect(
      mobileManageMember(request({ ...identity, display_name: 'ok' }), actor, trip, undefined)
    ).rejects.toMatchObject({ status, code });
  }
);
it('non-JSON body is refused', async () => {
  await expect(
    mobileManageMember(
      request({ ...identity, display_name: 'ok' }, 'text/plain'),
      actor,
      trip,
      undefined
    )
  ).rejects.toMatchObject({ status: 415 });
});
