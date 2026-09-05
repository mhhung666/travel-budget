import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAccountDuplicateKey } from '@/lib/mongoErrors';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateOne: vi.fn(),
  findOne: vi.fn(),
  codeFind: vi.fn(),
  codeDelete: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  createSession: mocks.session,
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('@/actions/withAuth', () => ({
  withAuth:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ userId: 'viewer' }, ...args),
}));
vi.mock('@/models', () => ({
  User: { create: mocks.create, updateOne: mocks.updateOne, findOne: mocks.findOne },
  PasswordResetCode: {},
  EmailChangeCode: { findOne: mocks.codeFind, deleteOne: mocks.codeDelete },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('hash') } }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/emailTemplates', () => ({
  buildPasswordResetEmail: vi.fn(),
  buildEmailChangeEmail: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { register, confirmEmailChange } from '@/actions/auth.actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findOne.mockReturnValue({ collation: () => ({ select: async () => null }) });
});

describe('account duplicate-key races', () => {
  it.each(['username', 'email'])(
    'returns CONFLICT when concurrent registration claims %s',
    async (field) => {
      mocks.create.mockRejectedValue({ code: 11000, keyPattern: { [field]: 1 } });
      expect(
        await register({
          username: 'tester',
          display_name: 'Tester',
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).toMatchObject({ success: false, code: 'CONFLICT' });
      expect(mocks.session).not.toHaveBeenCalled();
    }
  );
  it('returns CONFLICT when another account claims a verified email before the write', async () => {
    mocks.codeFind.mockResolvedValue({
      _id: 'code-id',
      newEmail: 'new@example.com',
      expiresAt: new Date(Date.now() + 60000),
      attempts: 0,
      codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
    });
    mocks.updateOne.mockRejectedValue({ code: 11000, keyPattern: { email: 1 } });
    expect(await confirmEmailChange({ code: '123456' })).toMatchObject({
      success: false,
      code: 'CONFLICT',
    });
    expect(mocks.updateOne).toHaveBeenCalled();
    expect(mocks.codeDelete).not.toHaveBeenCalled();
  });
  it('does not mask unrelated duplicate indexes or network failures', () => {
    for (const error of [
      null,
      new Error('network'),
      { code: 11000 },
      { code: 11000, keyPattern: { mapShareCode: 1 } },
      { code: 11000, keyPattern: { email: 1, other: 1 } },
    ]) {
      expect(isAccountDuplicateKey(error)).toBe(false);
    }
  });
});
