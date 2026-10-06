import { expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  request: vi.fn(),
  confirm: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock('@/lib/accountAdapter', () => ({
  accountEnvironment: async () => ({ db: {}, context: {} }),
  deliverAccountReset: vi.fn(),
}));
vi.mock('@/lib/accountEntry', async (load) => ({
  ...(await load<typeof import('@/lib/accountEntry')>()),
  registerAccount: mocks.register,
  requestAccountReset: mocks.request,
  confirmAccountReset: mocks.confirm,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({
  createSession: mocks.cookie,
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));
import { AccountEntryError } from '@/lib/accountEntry';
import { POST as register } from '@/app/api/v1/auth/register/route';
import { POST as request } from '@/app/api/v1/auth/password-reset/request/route';
import { POST as confirm } from '@/app/api/v1/auth/password-reset/confirm/route';
import {
  register as registerWeb,
  requestPasswordReset,
  resetPassword,
} from '@/actions/auth.actions';
const input = {
  username: 'tester',
  display_name: 'Name',
  email: 'test@example.com',
  password: '123456',
};
const body = (data: unknown) =>
  new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'unrelated-session' },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.register.mockResolvedValue({
    id: '111111111111111111111111',
    username: 'tester',
    displayName: 'Name',
  });
  mocks.request.mockResolvedValue({ accepted: true });
  mocks.confirm.mockResolvedValue({ reset: true });
  mocks.cookie.mockResolvedValue(undefined);
});
it('register returns only a user and no authentication/cookie', async () => {
  const response = await register(body(input));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(await response.json()).toEqual({
    data: { id: '111111111111111111111111', username: 'tester', displayName: 'Name' },
  });
  expect(mocks.cookie).not.toHaveBeenCalled();
});
it.each([
  ['ACCOUNT_CONFLICT', 409],
  ['RATE_LIMITED', 429],
] as const)('maps async %s to HTTP %s', async (code, status) => {
  mocks.register.mockRejectedValue(
    new AccountEntryError(code, code === 'RATE_LIMITED' ? 57 : undefined)
  );
  const response = await register(body(input));
  expect(response.status).toBe(status);
  expect((await response.json()).error.code).toBe(code);
  if (status === 429) expect(response.headers.get('retry-after')).toBe('57');
});
it.each(['INVALID_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS'] as const)(
  'maps %s without leaking account details',
  async (code) => {
    mocks.confirm.mockRejectedValue(new AccountEntryError(code));
    const response = await confirm(
      body({ email: input.email, code: '000007', new_password: input.password })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
  }
);
it('request accepts a normalized email, rejects extra data and bad content types', async () => {
  expect((await request(body({ email: ' TEST@EXAMPLE.COM ' }))).status).toBe(200);
  expect(mocks.request.mock.calls[0][1]).toEqual({ email: 'test@example.com' });
  expect((await request(body({ email: input.email, password: 'secret' }))).status).toBe(400);
  expect((await register(new Request('http://test', { method: 'POST', body: '{}' }))).status).toBe(
    415
  );
});
it('Web preserves committed registration when cookie creation fails', async () => {
  mocks.cookie.mockRejectedValue(new Error('cookie failed'));
  expect(await registerWeb(input)).toMatchObject({ success: true, data: { username: 'tester' } });
});
it('Web returns localized limit token and retry seconds from the same service', async () => {
  mocks.request.mockRejectedValue(new AccountEntryError('RATE_LIMITED', 60));
  expect(await requestPasswordReset({ email: input.email })).toEqual({
    success: false,
    error: 'RATE_LIMITED',
    code: 'RATE_LIMITED',
    retryAfter: 60,
  });
  mocks.confirm.mockRejectedValue(new AccountEntryError('CODE_EXPIRED'));
  expect(
    await resetPassword({ email: input.email, code: '000007', new_password: input.password })
  ).toMatchObject({ success: false, error: 'CODE_EXPIRED', code: 'VALIDATION_ERROR' });
});
