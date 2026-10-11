// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountProfileSchema, userSchema, accountProfileInput } from '@travel-budget/contracts';
import { User } from '@/models';
import { updateProfile, getCurrentUser } from '@/actions/auth.actions';
import { readAccountDetails, updateAccountProfile } from '@/lib/accountProfile';
import { loginMobile, refreshMobile } from '@/lib/mobile/session';
import { GET, PATCH } from '@/app/api/v2/me/profile/route';
import {
  GET as notificationGet,
  PATCH as notificationPatch,
} from '@/app/api/v2/me/notification-preferences/route';
import { getNotificationPrefs, updateNotificationPrefs } from '@/actions/auth.actions';
import { GET as me } from '@/app/api/v2/me/route';
const h = vi.hoisted(() => ({ actor: '' }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'isolated-profile-secret-at-least-32-characters' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
vi.mock('@/lib/auth', () => ({
  getSession: async () => ({ userId: h.actor }),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('M1 self profile on an owned database', () => {
  let owned = false;
  let token: Awaited<ReturnType<typeof loginMobile>>;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      autoCreate: false,
      autoIndex: false,
      dbName: `tb_profile_${randomUUID().replaceAll('-', '')}`,
    });
    expect(await mongoose.connection.db!.listCollections().toArray()).toHaveLength(0);
    await mongoose.connection.db!.createCollection('verification_owner');
    owned = true;
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    for (const name of ['users', 'mobilesessions', 'mobileloginattempts'])
      await mongoose.connection.db!.collection(name).deleteMany({});
    const user = await User.create({
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.invalid',
      password: await bcrypt.hash('password', 10),
      avatarUrl: 'https://example.invalid/avatar',
      notifyByEmail: false,
    });
    h.actor = user._id.toString();
    token = await loginMobile('alice', 'password');
  });
  const request = (body?: unknown, accessToken = token.accessToken) =>
    new Request('https://example.invalid/api/v2/me/profile', {
      method: body === undefined ? 'GET' : 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  it('shares Web validation and service, changes only the name, refreshes new identity and leaves auth DTO unchanged', async () => {
    const before = await User.findById(h.actor).lean();
    expect((await updateProfile({ display_name: '  Web Alice  ' })).success).toBe(true);
    const first = await GET(request());
    expect(accountProfileSchema.parse((await first.json()).data).displayName).toBe('Web Alice');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('vary')).toBe('Authorization');
    const response = await PATCH(request({ displayName: '  Mobile Alice  ' }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      id: h.actor,
      username: 'alice',
      displayName: 'Mobile Alice',
      email: 'alice@example.invalid',
    });
    const web = await getCurrentUser();
    expect(web.success && web.data?.display_name).toBe('Mobile Alice');
    const after = await User.findById(h.actor).lean();
    expect({ ...after, displayName: before!.displayName }).toEqual(before);
    expect((await refreshMobile(token.refreshToken)).user.displayName).toBe('Mobile Alice');
    const identity = (await (await me(request())).json()).data;
    expect(userSchema.parse(identity)).toEqual({
      id: h.actor,
      username: 'alice',
      displayName: 'Mobile Alice',
    });
    expect(Object.keys(identity).sort()).toEqual(['displayName', 'id', 'username']);
  });
  it('shares notification preferences across Web and Native with partial updates and actor isolation', async () => {
    const before = await User.findById(h.actor).lean();
    const peer = await User.create({
      username: 'bob',
      displayName: 'Bob',
      email: 'bob@example.invalid',
      password: 'unused',
      locale: 'jp',
    });
    expect(await getNotificationPrefs()).toEqual({
      success: true,
      data: { notifyByEmail: false, locale: 'zh' },
    });
    expect((await notificationPatch(request({ locale: 'en' }))).status).toBe(200);
    expect(await updateNotificationPrefs({ notify_by_email: true })).toEqual({
      success: true,
      data: { message: 'OK', notifyByEmail: true, locale: 'en' },
    });
    expect((await (await notificationGet(request())).json()).data).toEqual({
      notifyByEmail: true,
      locale: 'en',
    });
    const after = await User.findById(h.actor).lean();
    expect({ ...after, notifyByEmail: before!.notifyByEmail, locale: before!.locale }).toEqual(
      before
    );
    expect((await User.findById(peer._id).lean())?.locale).toBe('jp');
    expect(Object.keys((await (await me(request())).json()).data).sort()).toEqual([
      'displayName',
      'id',
      'username',
    ]);
  });
  it('rejects forged targets, email/password edits and invalid names without changing the record', async () => {
    for (const body of [
      { displayName: ' ' },
      { displayName: 'x'.repeat(101) },
      { displayName: 'New', userId: 'b'.repeat(24) },
      { displayName: 'New', email: 'other@example.invalid' },
      { displayName: 'New', password: 'password' },
    ]) {
      expect(accountProfileInput.safeParse(body).success).toBe(false);
      expect((await PATCH(request(body))).status).toBe(400);
    }
    expect((await updateProfile({ display_name: '   ' })).success).toBe(false);
    expect((await readAccountDetails(h.actor)).displayName).toBe('Alice');
  });
  it('requires valid bearer authentication, excludes virtual/deleted users and does not accept cookie-only access', async () => {
    expect(
      (
        await GET(
          new Request('https://example.invalid/api/v2/me/profile', {
            headers: { Cookie: 'session=anything' },
          })
        )
      ).status
    ).toBe(401);
    expect((await PATCH(request({ displayName: 'New' }, 'invalid'))).status).toBe(401);
    const virtual = await User.create({
      username: 'virtual',
      displayName: 'Virtual',
      email: 'virtual@example.invalid',
      password: 'unused',
      isVirtual: true,
    });
    await expect(
      updateAccountProfile(virtual._id.toString(), { displayName: 'New' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await User.deleteOne({ _id: h.actor });
    expect((await GET(request())).status).toBe(401);
  });
  it('updates only the authenticated actor and returns actual stored values on repeated explicit saves', async () => {
    const peer = await User.create({
      username: 'bob',
      displayName: 'Bob',
      email: 'bob@example.invalid',
      password: 'unused',
    });
    for (let i = 0; i < 2; i++)
      expect((await PATCH(request({ displayName: 'New' }))).status).toBe(200);
    expect((await User.findById(peer._id).lean())?.displayName).toBe('Bob');
    expect(await User.countDocuments()).toBe(2);
    expect((await readAccountDetails(h.actor)).displayName).toBe('New');
  });
});
