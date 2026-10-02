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
import { loginMobile, refreshMobile, requireMobileUser, logoutMobile } from '@/lib/mobile/session';
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
