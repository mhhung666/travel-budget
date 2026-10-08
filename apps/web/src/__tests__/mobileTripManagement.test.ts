import { beforeEach, expect, it, vi } from 'vitest';
import { mobileTripSettings, mobileManageTrip } from '@/lib/mobile/tripManagement';
import { TripManagementError } from '@/lib/tripManagement';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError } from '@/lib/mobile/http';
const h = vi.hoisted(() => ({ member: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('mongoose', async (original) => {
  const mongooseModule = await original<typeof import('mongoose')>();
  return { ...mongooseModule, default: { ...mongooseModule.default, connection: { db: {} } } };
});
vi.mock('@/lib/mobile/access', () => ({ requireTripMember: h.member }));
vi.mock('@/lib/tripManagement', async (original) => ({
  ...(await original<typeof import('@/lib/tripManagement')>()),
  readTripSettings: h.read,
  manageTrip: h.write,
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
it('membership is checked before parsing malformed input or exposing private settings', async () => {
  h.member.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
  await expect(
    mobileManageTrip(
      new Request('http://test', { method: 'PATCH', body: 'invalid' }),
      actor,
      trip,
      'trip.update'
    )
  ).rejects.toMatchObject({ status: 404 });
  await expect(mobileTripSettings(actor, trip)).rejects.toMatchObject({ status: 404 });
  expect(h.write).not.toHaveBeenCalled();
  expect(h.read).not.toHaveBeenCalled();
});
it('strict normalized input and authenticated actor delegate to common service', async () => {
  await mobileManageTrip(
    request({ ...identity, changes: { name: ' New ' } }),
    actor,
    trip,
    'trip.update'
  );
  expect(h.write).toHaveBeenCalledWith(
    expect.anything(),
    actor,
    trip,
    'trip.update',
    { ...identity, changes: { name: 'New' } },
    'g1-test'
  );
  await mobileManageTrip(request({ ...identity, archived: false }), actor, trip, 'trip.archive');
  expect(h.write.mock.calls[1][4]).toEqual({ ...identity, archived: false });
});
it.each([
  { ...identity, changes: { name: 'ok', budget: 100 } },
  { ...identity, changes: {} },
  { ...identity, changes: { start_date: '2026-02-30' } },
  { ...identity, changes: { name: 'ok' }, actor_id: actor },
])('unknown, empty or invalid edit is rejected before writing', async (body) => {
  await expect(mobileManageTrip(request(body), actor, trip, 'trip.update')).rejects.toMatchObject({
    status: 400,
  });
  expect(h.write).not.toHaveBeenCalled();
});
it.each([
  [new TripManagementError('FORBIDDEN'), 403, 'FORBIDDEN'],
  [new TripWriteError('FORBIDDEN'), 404, 'NOT_FOUND'],
  [new TripEntryError('RESOURCE_CHANGED'), 409, 'RESOURCE_CHANGED'],
  [new TripEntryError('BUSY'), 429, 'BUSY'],
])(
  'maps service refusal without confusing lost admin with lost membership',
  async (error, status, code) => {
    h.write.mockRejectedValueOnce(error);
    await expect(
      mobileManageTrip(
        request({ ...identity, changes: { name: 'ok' } }),
        actor,
        trip,
        'trip.update'
      )
    ).rejects.toMatchObject({ status, code });
  }
);
it('non-JSON body is refused', async () => {
  await expect(
    mobileManageTrip(
      request({ ...identity, changes: { name: 'ok' } }, 'text/plain'),
      actor,
      trip,
      'trip.update'
    )
  ).rejects.toMatchObject({ status: 415 });
});
