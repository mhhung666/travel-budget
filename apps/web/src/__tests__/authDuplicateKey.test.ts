import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAccountDuplicateKey } from '@/lib/mongoErrors';
import { AccountEmailError } from '@/lib/accountEmail';
const h = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@/lib/accountEmail', async (original) => ({
  ...(await original<typeof import('@/lib/accountEmail')>()),
  confirmAccountEmail: h.confirm,
}));
vi.mock('@/lib/accountAdapter', () => ({
  accountEnvironment: async () => ({ db: {}, context: {} }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/actions/withAuth', () => ({
  withAuth:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ userId: 'a'.repeat(24) }, ...args),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { confirmEmailChange } from '@/actions/auth.actions';
beforeEach(() => vi.clearAllMocks());
describe('account duplicate-key races', () => {
  it('maps the shared service conflict to the existing Web CONFLICT result', async () => {
    h.confirm.mockRejectedValue(new AccountEmailError('CONFLICT'));
    expect(await confirmEmailChange({ code: '123456' })).toMatchObject({
      success: false,
      code: 'CONFLICT',
    });
    expect(h.confirm).toHaveBeenCalledWith({}, 'a'.repeat(24), { code: '123456' }, {});
  });
  it('does not mask unrelated duplicate indexes or network failures', () => {
    for (const error of [
      null,
      new Error('network'),
      { code: 11000 },
      { code: 11000, keyPattern: { mapShareCode: 1 } },
      { code: 11000, keyPattern: { email: 1, other: 1 } },
    ])
      expect(isAccountDuplicateKey(error)).toBe(false);
  });
});
