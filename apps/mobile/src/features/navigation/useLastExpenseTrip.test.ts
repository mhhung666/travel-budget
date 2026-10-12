import { beforeEach, expect, it, vi } from 'vitest';
import { useLastExpenseTrip } from './useLastExpenseTrip';
const h = vi.hoisted(() => ({
  user: { id: 'a'.repeat(24) },
  version: 1,
  environment: 'env',
  value: null as unknown,
  cleanup: undefined as (() => void) | undefined,
  effect: undefined as (() => () => void) | undefined,
  read: vi.fn(),
}));
vi.mock('react', () => ({
  useState: () => [
    h.value,
    (value: unknown) => {
      h.value = value;
    },
  ],
  useEffect: (effect: () => () => void) => {
    h.effect = effect;
  },
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: h.user,
    manager: {
      api: { environment: h.environment },
      getSignInVersion: () => h.version,
      getSnapshot: () => ({ user: h.user }),
    },
  }),
}));
vi.mock('@/storage/expenseTripPreference', () => ({
  openLastExpenseTripStore: async () => ({ read: h.read }),
}));
const drain = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve();
};
beforeEach(() => {
  h.user = { id: 'a'.repeat(24) };
  h.version = 1;
  h.environment = 'env';
  h.value = null;
  h.cleanup = undefined;
  h.effect = undefined;
  h.read.mockReset();
});
it('withholds previous-account/environment preferences immediately, and rejects A→B→A late reads', async () => {
  let resolve!: (value: string) => void;
  h.read.mockReturnValue(
    new Promise<string>((r) => {
      resolve = r;
    })
  );
  expect(useLastExpenseTrip()).toBeNull();
  h.cleanup = h.effect!();
  await drain();
  h.version = 3;
  resolve('1'.repeat(24));
  await drain();
  expect(h.value).toBeNull();
  h.cleanup();
  h.read.mockResolvedValue('2'.repeat(24));
  useLastExpenseTrip();
  h.effect!();
  await drain();
  expect(useLastExpenseTrip()).toBe('2'.repeat(24));
  h.user = { id: 'b'.repeat(24) };
  expect(useLastExpenseTrip()).toBeNull();
  h.user = { id: 'a'.repeat(24) };
  h.environment = 'other';
  expect(useLastExpenseTrip()).toBeNull();
});
it.each(['storage-failure', 'malformed', 'unmounted'])(
  'optional preference %s never blocks entry or injects a selection',
  async (caseName) => {
    if (caseName === 'storage-failure') h.read.mockRejectedValue(new Error('DISK_FULL'));
    else h.read.mockResolvedValue(caseName === 'malformed' ? 'invalid' : '1'.repeat(24));
    useLastExpenseTrip();
    const cleanup = h.effect!();
    if (caseName === 'unmounted') cleanup();
    await drain();
    expect(useLastExpenseTrip()).toBeNull();
  }
);
