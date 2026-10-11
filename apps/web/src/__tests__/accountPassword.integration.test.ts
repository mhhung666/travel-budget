// @vitest-environment node
import { randomUUID, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordChangeInput } from '@travel-budget/contracts';
import { User } from '@/models';
import { createSession, encrypt, getSession, getSessionFromRequest } from '@/lib/auth';
import { changeAccountPassword } from '@/lib/accountPassword';
import { confirmAccountReset } from '@/lib/accountEntry';
import { loginMobile, refreshMobile, requireMobileUser } from '@/lib/mobile/session';
import { POST } from '@/app/api/v2/me/password/route';
import { updateProfile } from '@/actions/auth.actions';
const h = vi.hoisted(() => ({ cookie: '', failDelete: false }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
    set: (_key: string, value: string) => {
      h.cookie = value;
    },
    delete: () => {
      if (h.failDelete) throw new Error('cleanup failed');
      h.cookie = '';
    },
  }),
}));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'isolated-password-secret-at-least-32-characters' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
const uri = process.env.MONGODB_MEMBER_TEST_URI,
  allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('M3a on an owned isolated database', () => {
  let owned = false,
    id: string,
    originalHash: string;
  let token: Awaited<ReturnType<typeof loginMobile>>;
  const context = { secret: 'isolated-password-secret-at-least-32-characters' };
  const input = { current_password: 'old password', new_password: 'new password' };
  const db = () => mongoose.connection.db!;
  const request = (body: unknown = input, access = token.accessToken) =>
    new Request('https://example.invalid/api/v2/me/password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      autoCreate: false,
      autoIndex: false,
      dbName: `tb_password_${randomUUID().replaceAll('-', '')}`,
    });
    expect(await db().listCollections().toArray()).toHaveLength(0);
    await db().createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    try {
      if (owned) await db().dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    for (const c of [
      'users',
      'mobilesessions',
      'mobileloginattempts',
      'accountentryattempts',
      'passwordresetcodes',
    ])
      await db().collection(c).deleteMany({});
    h.failDelete = false;
    const user = await User.create({
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.invalid',
      password: await bcrypt.hash('old password', 10),
    });
    id = user._id.toString();
    originalHash = user.password;
    token = await loginMobile('alice', 'old password');
    await createSession(id, 'alice', originalHash);
  });
  it('HTTP changes atomically and revokes every old native session and Web cookie; new credentials work', async () => {
    const second = await loginMobile('alice', 'old password');
    const oldCookie = h.cookie;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
    expect((await response.json()).data).toEqual({ changed: true, reauthenticate: true });
    expect(await getSession()).toBeNull();
    expect(
      await getSessionFromRequest(
        new NextRequest('https://example.invalid', { headers: { Cookie: `session=${oldCookie}` } })
      )
    ).toBeNull();
    for (const s of [token, second]) {
      await expect(requireMobileUser(request(input, s.accessToken))).rejects.toMatchObject({
        status: 401,
      });
      await expect(refreshMobile(s.refreshToken)).rejects.toMatchObject({ status: 401 });
    }
    await expect(loginMobile('alice', 'old password')).rejects.toMatchObject({ status: 401 });
    const current = await loginMobile('alice', 'new password');
    expect(current.user.id).toBe(id);
    await createSession(id, 'alice', (await User.findById(id))!.password);
    expect((await getSession())?.userId).toBe(id);
  });
  it('Web shares rules and quota; wrong passwords and oversized UTF-8 never change credentials', async () => {
    for (const value of ['中'.repeat(25), 'short']) {
      expect(passwordChangeInput.safeParse({ ...input, new_password: value }).success).toBe(false);
      expect((await POST(request({ ...input, new_password: value }))).status).toBe(400);
    }
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0)
        expect((await POST(request({ ...input, current_password: 'wrong' }))).status).toBe(400);
      else
        expect(
          await updateProfile({ current_password: 'wrong', new_password: input.new_password })
        ).toMatchObject({ success: false, error: 'INVALID_CURRENT_PASSWORD' });
    }
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await User.findById(id))!.password).toBe(originalHash);
  });
  it('concurrent changes have one winner; rejected replays cannot change again', async () => {
    const results = await Promise.allSettled([
      changeAccountPassword(db(), id, input, context),
      changeAccountPassword(db(), id, { ...input, new_password: 'other password' }, context),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await User.findById(id))!.authVersion).toBe(1);
    await expect(changeAccountPassword(db(), id, input, context)).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
    });
  });
  it('legacy cookies work until password reset increments the same version; stale credential mint is refused', async () => {
    h.cookie = await encrypt({
      userId: id,
      username: 'alice',
      expiresAt: new Date(Date.now() + 10000),
    });
    expect((await getSession())?.userId).toBe(id);
    await db()
      .collection('passwordresetcodes')
      .insertOne({
        user: new mongoose.mongo.ObjectId(id),
        codeHash: createHash('sha256').update('012345').digest('hex'),
        attempts: 0,
        expiresAt: new Date(Date.now() + 60000),
      });
    await confirmAccountReset(
      db(),
      { email: 'alice@example.invalid', code: '012345', new_password: 'reset password' },
      context
    );
    expect(await getSession()).toBeNull();
    await expect(createSession(id, 'alice', originalHash)).rejects.toThrow('Account unavailable');
    await expect(refreshMobile(token.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
  it('requires bearer identity and rejects forged target, virtual/deleted accounts', async () => {
    expect(
      (
        await POST(
          new Request('https://example.invalid/api/v2/me/password', {
            method: 'POST',
            headers: { Cookie: `session=${h.cookie}` },
          })
        )
      ).status
    ).toBe(401);
    expect((await POST(request({ ...input, userId: 'b'.repeat(24) }))).status).toBe(400);
    await User.updateOne({ _id: id }, { $set: { isVirtual: true } });
    expect((await POST(request())).status).toBe(401);
    await expect(changeAccountPassword(db(), id, input, context)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await User.deleteOne({ _id: id });
    expect((await POST(request())).status).toBe(401);
  });
  it('Web successful password update returns success even if cookie cleanup fails; DB revocation is authoritative', async () => {
    h.failDelete = true;
    const result = await updateProfile(input);
    expect(result.success).toBe(true);
    h.cookie = await encrypt({ userId: id, username: 'alice', expiresAt: new Date() });
    expect(await getSession()).toBeNull();
    expect((await User.findById(id))!.authVersion).toBe(1);
  });
});
