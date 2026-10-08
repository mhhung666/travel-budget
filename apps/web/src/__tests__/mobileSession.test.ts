// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findSession: vi.fn(),
  update: vi.fn(),
  throttle: vi.fn(),
  user: vi.fn(),
  credentials: vi.fn(),
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'test-only-secret-with-at-least-thirty-two-characters' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/models', () => ({ User: { findById: mocks.user } }));
vi.mock('@/lib/credentials', () => ({ verifyCredentials: mocks.credentials }));
vi.mock('@/models/MobileSession', () => ({
  MobileSession: { create: mocks.create, findOne: mocks.findSession, updateOne: mocks.update },
  MobileLoginAttempt: { findOneAndUpdate: mocks.throttle },
}));
vi.mock('@/lib/accountAdapter', () => ({
  accountEnvironment: vi.fn(),
  deliverAccountReset: vi.fn(),
}));
import { loginMobile, refreshMobile, requireMobileUser, logoutMobile } from '@/lib/mobile/session';
import { POST as v1Login } from '@/app/api/v1/auth/login/route';
import { POST as v1Refresh } from '@/app/api/v1/auth/refresh/route';
import { POST as v1Logout } from '@/app/api/v1/auth/logout/route';
import { GET as v1Me } from '@/app/api/v1/me/route';
import { POST as v2Login } from '@/app/api/v2/auth/login/route';
import { POST as v2Refresh } from '@/app/api/v2/auth/refresh/route';
import { POST as v2Logout } from '@/app/api/v2/auth/logout/route';
import { GET as v2Me } from '@/app/api/v2/me/route';
import { decrypt } from '@/lib/auth';
const user = {
  _id: '507f191e810c19729de860ea',
  username: 'travel',
  displayName: 'Travel',
  password: 'bcrypt-password-hash',
  isVirtual: false,
};
type RecordState = {
  _id: { toString(): string };
  user: string;
  refreshHash: string;
  credentialHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};
let record: RecordState | null;
beforeEach(() => {
  vi.clearAllMocks();
  record = null;
  mocks.throttle.mockResolvedValue({ count: 1 });
  mocks.credentials.mockResolvedValue({ ...user });
  mocks.user.mockImplementation(() => ({ select: vi.fn().mockResolvedValue({ ...user }) }));
  mocks.create.mockImplementation(async (value) => {
    record = { ...value, revokedAt: null };
  });
  mocks.findSession.mockImplementation(async (filter) =>
    record &&
    record._id.toString() === filter._id &&
    !record.revokedAt &&
    record.expiresAt > new Date()
      ? { ...record }
      : null
  );
  mocks.update.mockImplementation(async (filter, change) => {
    if (
      !record ||
      record._id.toString() !== filter._id ||
      (filter.refreshHash && (record.refreshHash !== filter.refreshHash || record.revokedAt))
    )
      return { modifiedCount: 0 };
    Object.assign(record, change.$set);
    return { modifiedCount: 1 };
  });
});
const request = (token: string) =>
  new Request('https://example.com/api/v1/me', { headers: { Authorization: `Bearer ${token}` } });
describe('mobile device sessions', () => {
  it('stores hashes only; separates mobile access, refresh, and Web cookie credentials', async () => {
    const session = await loginMobile('travel', 'password');
    expect(record?.refreshHash).not.toBe(session.refreshToken);
    expect(record?.credentialHash).not.toBe(user.password);
    expect(await requireMobileUser(request(session.accessToken))).toEqual({
      id: user._id,
      username: user.username,
      displayName: user.displayName,
    });
    await expect(requireMobileUser(request(session.refreshToken))).rejects.toMatchObject({
      status: 401,
    });
    expect(await decrypt(session.accessToken)).toBeNull();
    const webToken = await new SignJWT({ userId: user._id })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('test-only-secret-with-at-least-thirty-two-characters'));
    await expect(requireMobileUser(request(webToken))).rejects.toMatchObject({ status: 401 });
  });
  it('rotates once and revokes the family when a consumed refresh token is replayed', async () => {
    const first = await loginMobile('travel', 'password');
    const second = await refreshMobile(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(refreshMobile(first.refreshToken)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    await expect(requireMobileUser(request(second.accessToken))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('allows only one concurrent refresh consumer and fails closed on replay', async () => {
    const first = await loginMobile('travel', 'password');
    const results = await Promise.allSettled([
      refreshMobile(first.refreshToken),
      refreshMobile(first.refreshToken),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(record?.revokedAt).toBeInstanceOf(Date);
  });
  it('revokes access immediately on logout and repeated logout is safe', async () => {
    const session = await loginMobile('travel', 'password');
    await logoutMobile(session.refreshToken);
    await logoutMobile(session.refreshToken);
    await expect(requireMobileUser(request(session.accessToken))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects sessions after a password change', async () => {
    const session = await loginMobile('travel', 'password');
    mocks.user.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...user, password: 'new-password-hash' }),
    });
    await expect(requireMobileUser(request(session.accessToken))).rejects.toMatchObject({
      status: 401,
    });
    expect(record?.revokedAt).toBeInstanceOf(Date);
  });
  it('checks absolute expiry even before TTL cleanup', async () => {
    const session = await loginMobile('travel', 'password');
    record!.expiresAt = new Date(Date.now() - 1);
    await expect(requireMobileUser(request(session.accessToken))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('limits login attempts before checking passwords', async () => {
    mocks.throttle.mockResolvedValue({ count: 11 });
    await expect(loginMobile('travel', 'password')).rejects.toMatchObject({ status: 429 });
    expect(mocks.credentials).not.toHaveBeenCalled();
  });
  it('rejects missing bearer credentials and invalid passwords', async () => {
    await expect(requireMobileUser(new Request('https://example.com'))).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.findSession).not.toHaveBeenCalled();
    mocks.credentials.mockResolvedValue(null);
    await expect(loginMobile('travel', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

const routes = {
  v1: { login: v1Login, refresh: v1Refresh, logout: v1Logout, me: v1Me },
  v2: { login: v2Login, refresh: v2Refresh, logout: v2Logout, me: v2Me },
};
type Version = keyof typeof routes;
const post = (version: Version, path: string, data: unknown, type = 'application/json') =>
  new Request(`https://example.com/api/${version}/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: JSON.stringify(data),
  });
const me = (version: Version, token: string) =>
  routes[version].me(
    new Request(`https://example.com/api/${version}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
const signIn = async (version: Version) =>
  (await (await routes[version].login(post(version, 'login', credentials))).json()).data;
const credentials = { username: 'travel', password: 'password' };
describe.each(['v1', 'v2'] as const)('%s auth HTTP', (version) => {
  const route = routes[version];
  it('logs in, reads me and rotates refresh once without a ledger', async () => {
    const response = await route.login(post(version, 'login', credentials));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const session = (await response.json()).data;
    expect(Object.keys(session).sort()).toEqual([
      'accessToken',
      'expiresIn',
      'refreshToken',
      'user',
    ]);
    const identity = { id: user._id, username: 'travel', displayName: 'Travel' };
    expect(session.user).toEqual(identity);
    expect(await (await me(version, session.accessToken)).json()).toEqual({ data: identity });
    const rotated = await route.refresh(
      post(version, 'refresh', { refreshToken: session.refreshToken })
    );
    const next = (await rotated.json()).data;
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const replay = await route.refresh(
      post(version, 'refresh', { refreshToken: session.refreshToken })
    );
    expect(replay.status).toBe(401);
    expect((await replay.json()).error.code).toBe('SESSION_REVOKED');
  });
  it('logs out with the refresh token and rejects the access token afterwards', async () => {
    const session = await signIn(version);
    const response = await route.logout(
      post(version, 'logout', { refreshToken: session.refreshToken })
    );
    expect(await response.json()).toEqual({ data: { loggedOut: true } });
    expect((await me(version, session.accessToken)).status).toBe(401);
  });
  it('keeps login limits, credential errors and body validation', async () => {
    mocks.throttle.mockResolvedValue({ count: 11 });
    const limited = await route.login(post(version, 'login', credentials));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(mocks.credentials).not.toHaveBeenCalled();
    mocks.throttle.mockResolvedValue({ count: 1 });
    mocks.credentials.mockResolvedValue(null);
    const invalid = await route.login(post(version, 'login', credentials));
    expect([invalid.status, (await invalid.json()).error.code]).toEqual([
      401,
      'INVALID_CREDENTIALS',
    ]);
    expect((await route.login(post(version, 'login', { ...credentials, x: 1 }))).status).toBe(400);
    expect((await route.refresh(post(version, 'refresh', {}, 'text/plain'))).status).toBe(415);
  });
});
it('one device session refreshes across API versions with a single consumer', async () => {
  const session = await signIn('v1');
  const v2 = await v2Refresh(post('v2', 'refresh', { refreshToken: session.refreshToken }));
  const next = (await v2.json()).data;
  const v1 = await v1Refresh(post('v1', 'refresh', { refreshToken: next.refreshToken }));
  expect(v1.status).toBe(200);
  const replay = await v2Refresh(post('v2', 'refresh', { refreshToken: next.refreshToken }));
  expect((await replay.json()).error.code).toBe('SESSION_REVOKED');
});
