import { beforeEach, expect, it, vi } from 'vitest';
import {
  mobileTripAccess,
  mobileManageTripAccess,
  mobileMemberClaimInvitation,
} from '@/lib/mobile/tripAccess';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError } from '@/lib/mobile/http';
const h = vi.hoisted(() => ({
  member: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  fence: vi.fn(),
  trip: vi.fn(),
  user: vi.fn(),
}));
vi.mock('mongoose', async (original) => {
  const mod = await original<typeof import('mongoose')>();
  return {
    ...mod,
    default: {
      ...mod.default,
      connection: {
        db: { collection: (name: string) => ({ findOne: name === 'trips' ? h.trip : h.user }) },
      },
    },
  };
});
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/mobile/access', () => ({ requireTripMember: h.member }));
vi.mock('@/lib/tripAccess', () => ({ readTripAccess: h.read, manageTripAccess: h.write }));
vi.mock('@/lib/tripWriteTransaction', async (original) => ({
  ...(await original<typeof import('@/lib/tripWriteTransaction')>()),
  withTripWriteInDatabase: h.fence,
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'test', APP_URL: 'https://web.test' }),
}));
const actor = 'a'.repeat(24),
  trip = 'b'.repeat(24),
  target = 'd'.repeat(24);
const body = {
  action: 'delete',
  client_request_id: '11111111-1111-4111-8111-111111111111',
  expected_revision: 'c'.repeat(64),
};
const request = (input: unknown) =>
  new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  vi.resetAllMocks();
  h.member.mockResolvedValue(trip);
  h.fence.mockImplementation(async (_db, _trip, _actor, task) => task({}));
  h.trip.mockResolvedValue({
    hashCode: 'capability',
    members: [
      { user: { toString: () => actor }, role: 'admin' },
      { user: { toString: () => target } },
    ],
  });
  h.user.mockResolvedValue({ username: 'virtual_unique' });
});
it('reads require current membership before private context', async () => {
  h.member.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
  await expect(mobileTripAccess(actor, trip)).rejects.toMatchObject({ status: 404 });
  expect(h.read).not.toHaveBeenCalled();
});
it('exit replay delegates authenticated actor to service without requiring lost membership', async () => {
  await mobileManageTripAccess(request(body), actor, trip);
  expect(h.member).not.toHaveBeenCalled();
  expect(h.write).toHaveBeenCalledWith(expect.anything(), actor, trip, body, 'test');
});
it.each([
  { ...body, password: 'secret' },
  { ...body, action: 'role' },
  { ...body, action: 'remove', member_id: 'invalid' },
])('strict operation input rejects unconfirmed or private fields', async (input) => {
  await expect(mobileManageTripAccess(request(input), actor, trip)).rejects.toMatchObject({
    status: 400,
  });
  expect(h.write).not.toHaveBeenCalled();
});
it.each([
  [new TripEntryError('FORBIDDEN'), 403],
  [new TripEntryError('RESOURCE_CHANGED'), 409],
  [new TripEntryError('VALIDATION_ERROR'), 409],
  [new TripWriteError('FORBIDDEN'), 404],
  [new TripEntryError('BUSY'), 429],
])('maps terminal and transient errors', async (error, status) => {
  h.write.mockRejectedValue(error);
  await expect(mobileManageTripAccess(request(body), actor, trip)).rejects.toMatchObject({
    status,
  });
});
it('claim capability reveals only URL, uses share code and virtual login identifier internally', async () => {
  expect(await mobileMemberClaimInvitation(actor, trip, target)).toEqual({
    url: 'https://web.test/link-virtual/capability/virtual_unique',
  });
  expect(h.fence.mock.calls[0][2]).toBe(actor);
});
it('demotion during claim read is forbidden without claiming loss of trip membership', async () => {
  h.trip.mockResolvedValue({
    hashCode: 'capability',
    members: [
      { user: { toString: () => actor }, role: 'member' },
      { user: { toString: () => target } },
    ],
  });
  await expect(mobileMemberClaimInvitation(actor, trip, target)).rejects.toMatchObject({
    status: 403,
    code: 'FORBIDDEN',
  });
});
it('removed or claimed target does not yield a link', async () => {
  h.user.mockResolvedValue(null);
  await expect(mobileMemberClaimInvitation(actor, trip, target)).rejects.toMatchObject({
    status: 409,
    code: 'RESOURCE_GONE',
  });
});
