import { beforeEach, expect, it, vi } from 'vitest';
import { mobileTripCurrency, mobileManageTrip } from '@/lib/mobile/tripManagement';
import { GET as ratesRoute } from '@/app/api/v2/trips/[id]/exchange-rates/route';
import { authorizeLedger } from '@/lib/ledger';
import { TripEntryError } from '@/lib/tripEntry';
import { TripWriteError } from '@/lib/tripWriteTransaction';
import { ApiError } from '@/lib/mobile/http';
const h = vi.hoisted(() => ({
  member: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  rates: vi.fn(),
  user: vi.fn(),
}));
vi.mock('@/lib/mobile/access', () => ({ requireTripMember: h.member }));
vi.mock('@/lib/tripManagement', async (original) => ({
  ...(await original<typeof import('@/lib/tripManagement')>()),
  readTripCurrency: h.read,
  manageTrip: h.write,
}));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ JWT_SECRET: 'test' }) }));
vi.mock('@/lib/mobile/session', () => ({ requireMobileUser: h.user }));
vi.mock('@/lib/referenceRates', async (original) => ({
  ...(await original<typeof import('@/lib/referenceRates')>()),
  readReferenceRates: h.rates,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
const actor = 'a'.repeat(24),
  trip = 'b'.repeat(24);
const body = {
  client_request_id: '11111111-1111-4111-8111-111111111111',
  expected_revision: 'c'.repeat(64),
  settings: { default_currency: null, currencies: [{ code: 'JPY', rate: 0.21 }] },
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
  h.user.mockResolvedValue({ id: actor });
});
it('all settings reads and writes recheck membership', async () => {
  h.member.mockRejectedValue(new ApiError(404, 'NOT_FOUND'));
  await expect(mobileTripCurrency(actor, trip)).rejects.toMatchObject({ status: 404 });
  await expect(mobileManageTrip(request(body), actor, trip, 'trip.currency')).rejects.toMatchObject(
    { status: 404 }
  );
  expect(h.read).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
});
it('strict settings body delegates to shared writer without querying external rates', async () => {
  h.write.mockResolvedValue({ tripId: trip, revision: 'd'.repeat(64) });
  expect(await mobileManageTrip(request(body), actor, trip, 'trip.currency')).toMatchObject({
    tripId: trip,
  });
  expect(h.write).toHaveBeenCalledWith(undefined, actor, trip, 'trip.currency', body, 'test');
  await expect(
    mobileManageTrip(request({ ...body, secret: 'x' }), actor, trip, 'trip.currency')
  ).rejects.toMatchObject({ status: 400 });
  expect(h.rates).not.toHaveBeenCalled();
});
it.each([
  [new TripEntryError('FORBIDDEN'), 403],
  [new TripEntryError('RESOURCE_CHANGED'), 409],
  [new TripEntryError('VALIDATION_ERROR'), 409],
  [new TripEntryError('BUSY'), 429],
  [new TripWriteError('FORBIDDEN'), 404],
])('maps %s to %s and distinguishes admin demotion from lost membership', async (error, status) => {
  h.write.mockRejectedValue(error);
  await expect(mobileManageTrip(request(body), actor, trip, 'trip.currency')).rejects.toMatchObject(
    { status }
  );
});
it('trip rates are bearer and member authenticated, no-store, and never substitute a missing value', async () => {
  const get = () =>
    ratesRoute(new Request('http://test'), { params: Promise.resolve({ id: trip }) });
  h.user.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED'));
  expect((await get()).status).toBe(401);
  h.member.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND'));
  expect((await get()).status).toBe(404);
  expect(h.rates).not.toHaveBeenCalled();
  // The real member check records the trip ledger the rates are rebased on.
  h.member.mockImplementation(async () => {
    authorizeLedger({ baseCurrency: 'TWD' });
    return trip;
  });
  h.rates.mockRejectedValueOnce(new Error('upstream'));
  const failure = await get();
  expect(failure.status).toBe(503);
  expect((await failure.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  h.rates.mockResolvedValue({
    rates: { TWD: 1, JPY: 0.2, USD: 0.03 },
    dates: { JPY: '2026-10-07' },
    provider: 'Frankfurter',
  });
  const result = await get();
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.headers.get('vary')).toBe('Authorization');
  const { data } = await result.json();
  expect(data.ledger).toEqual({ baseCurrency: 'TWD', moneyScale: 2 });
  expect(data.rates).toMatchObject({ TWD: 1, JPY: 0.2 });
  // A quote without a publication date is reported unavailable, never filled in.
  expect(data.unavailable).toEqual(expect.arrayContaining(['USD', 'EUR']));
  expect(data.rates).not.toHaveProperty('USD');
});
it('a USD trip receives quotes rebased to USD instead of a TWD-snapshot validation failure', async () => {
  h.member.mockImplementation(async () => {
    authorizeLedger({ baseCurrency: 'USD' });
    return trip;
  });
  h.rates.mockResolvedValue({
    rates: { TWD: 1, USD: 30, JPY: 0.21 },
    dates: { USD: '2026-10-07', JPY: '2026-10-07' },
    provider: 'Frankfurter',
  });
  const result = await ratesRoute(new Request('http://test'), {
    params: Promise.resolve({ id: trip }),
  });
  expect(result.status).toBe(200);
  const { data } = await result.json();
  expect(data.ledger).toEqual({ baseCurrency: 'USD', moneyScale: 2 });
  expect(data.rates).toMatchObject({ USD: 1, TWD: 1 / 30, JPY: 0.007 });
  expect(data.dates).toMatchObject({ TWD: '2026-10-07', JPY: '2026-10-07' });
});
