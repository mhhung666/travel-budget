import { beforeEach, expect, it, vi } from 'vitest';
import { setTripCurrencySettings } from '@/actions/currency.actions';
import { TripWriteError } from '@/lib/tripWriteTransaction';
const h = vi.hoisted(() => ({
  member: vi.fn(),
  write: vi.fn(),
  revalidate: vi.fn(),
  dto: vi.fn(),
}));
vi.mock('@/actions/withAuth', () => ({
  withAuth:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ userId: 'actor' }, ...args),
}));
vi.mock('@/lib/permissions', () => ({ getTripMembership: h.member }));
vi.mock('@/lib/currencySettings', () => ({ setCurrencySettingsForActor: h.write }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }));
vi.mock('@/lib/dto', () => ({ toTripDto: h.dto }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  h.member.mockResolvedValue({ tripId: 'trip', role: 'admin' });
  h.write.mockResolvedValue({ name: 'Saved' });
  h.dto.mockReturnValue({ name: 'Saved' });
});
it('Web currency save delegates normalized input to shared writer', async () => {
  const input = { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: 0.2 }] };
  const result = await setTripCurrencySettings('code', input);
  expect(result.success).toBe(true);
  expect(h.write).toHaveBeenCalledWith(undefined, 'actor', 'trip', input);
});
it('post-commit revalidation cannot turn a saved operation into a failure', async () => {
  h.revalidate.mockImplementation(() => {
    throw new Error('cache');
  });
  expect((await setTripCurrencySettings('code', {})).success).toBe(true);
});
it('admin loss under the shared fence refuses the write', async () => {
  h.write.mockRejectedValue(new TripWriteError('FORBIDDEN'));
  expect(await setTripCurrencySettings('code', {})).toMatchObject({
    success: false,
    code: 'NOT_FOUND',
  });
});
