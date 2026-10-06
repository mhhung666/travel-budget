// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose, { mongo } from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import {
  registerAccount,
  requestAccountReset,
  confirmAccountReset,
  claimAccountLimit,
  ACCOUNT_ATTEMPTS,
  accountPolicy,
  type AccountContext,
} from '@/lib/accountEntry';
import {
  register,
  login as loginWeb,
  requestPasswordReset,
  resetPassword,
} from '@/actions/auth.actions';
import { loginMobile, requireMobileUser, refreshMobile } from '@/lib/mobile/session';
import { POST as registerHttp } from '@/app/api/v1/auth/register/route';
import { POST as requestHttp } from '@/app/api/v1/auth/password-reset/request/route';
import { POST as confirmHttp } from '@/app/api/v1/auth/password-reset/confirm/route';
import { User, PasswordResetCode } from '@/models';

const secret = 'isolated-account-entry-secret-at-least-32-chars';
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'isolated-account-entry-secret-at-least-32-chars' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
const mocks = vi.hoisted(() => ({ cookie: vi.fn(), deliver: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  createSession: mocks.cookie,
  getSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.deliver }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');

describe.skipIf(!uri || !allowed)('E2 account entry against isolated replica set', () => {
  let db: mongo.Db;
  let clock: number;
  let context: AccountContext;
  const email = 'tester@example.invalid';
  const input = () => ({
    username: ' Tester ',
    display_name: ' Person ',
    email: ' TESTER@EXAMPLE.INVALID ',
    password: ' 密碼123 ',
  });
  const seed = async (code = '000007') => {
    const user = await registerAccount(db, input(), context);
    await db.collection('passwordresetcodes').insertOne({
      user: new mongo.ObjectId(user.id),
      codeHash: createHash('sha256').update(code).digest('hex'),
      attempts: 0,
      expiresAt: new Date(clock + 15 * 60_000),
    });
    return user;
  };
  const confirm = (code = '000007', new_password = 'NewPassword') =>
    confirmAccountReset(db, { email, code, new_password }, context);
  beforeAll(async () => {
    await mongoose.connect(uri!, { dbName: `tb_e2_${randomUUID().replaceAll('-', '')}` });
    db = mongoose.connection.db!;
    expect((await db.admin().command({ hello: 1 })).setName).toBeTruthy();
    await User.init();
    await PasswordResetCode.init();
    await db.collection(ACCOUNT_ATTEMPTS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });
  afterAll(async () => {
    try {
      await db?.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    for (const name of [
      'users',
      'passwordresetcodes',
      ACCOUNT_ATTEMPTS,
      'mobilesessions',
      'mobileloginattempts',
    ])
      await db.collection(name).deleteMany({});
    clock = Date.now();
    context = { secret, now: () => clock };
    mocks.cookie.mockReset().mockResolvedValue(undefined);
    mocks.deliver.mockReset().mockResolvedValue(true);
  });
  it('normalizes fields, preserves password spaces, rejects case-insensitive username/email collisions', async () => {
    const user = await registerAccount(db, input(), context);
    expect(user).toEqual({ id: expect.any(String), username: 'Tester', displayName: 'Person' });
    const record = await db.collection('users').findOne({ _id: new mongo.ObjectId(user.id) });
    expect(record!.email).toBe(email);
    expect(await bcrypt.compare(' 密碼123 ', record!.password)).toBe(true);
    expect(await bcrypt.compare('密碼123', record!.password)).toBe(false);
    await expect(
      registerAccount(
        db,
        { ...input(), username: 'tester', email: 'other@example.invalid' },
        context
      )
    ).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
    await expect(
      registerAccount(db, { ...input(), username: 'other' }, context)
    ).rejects.toMatchObject({ code: 'ACCOUNT_CONFLICT' });
  });
  it('concurrent registration inserts one account with a uniform conflict', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => registerAccount(db, input(), context))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results)
      if (r.status === 'rejected') expect(r.reason.code).toBe('ACCOUNT_CONFLICT');
    expect(await db.collection('users').countDocuments()).toBe(1);
  });
  it('concurrent valid codes succeed once, even with different new passwords', async () => {
    await seed();
    const results = await Promise.allSettled([
      confirm('000007', 'FirstPass'),
      confirm('000007', 'SecondPass'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('passwordresetcodes').countDocuments()).toBe(0);
    await expect(confirm()).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
  it('five concurrent wrong codes do not lose attempts; the correct code is then blocked', async () => {
    await seed();
    await Promise.all(Array.from({ length: 5 }, () => confirm('000008').catch((e) => e)));
    expect((await db.collection('passwordresetcodes').findOne())!.attempts).toBe(5);
    await expect(confirm()).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });
  it('expiry is checked even before TTL deletion', async () => {
    await seed();
    clock += 15 * 60_000;
    await expect(confirm()).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
  });
  it('anonymous repeated requests cannot invalidate a delivered code or exhaust the next issuance', async () => {
    await registerAccount(db, input(), context);
    const delivered: string[] = [];
    const deliver = vi.fn(async (_email: string, code: string) => {
      delivered.push(code);
    });
    await requestAccountReset(db, { email }, context, deliver);
    const original = await db.collection('passwordresetcodes').findOne();
    for (let i = 1; i <= 5; i++) {
      clock += 60_000;
      await expect(requestAccountReset(db, { email }, context, deliver)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 900 - i * 60,
      });
      expect(await db.collection('passwordresetcodes').findOne()).toEqual(original);
    }
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await confirm(delivered[0])).toEqual({ reset: true });
    // At the original expiry a new request succeeds, rather than waiting for the hour cap.
    clock += 10 * 60_000;
    await requestAccountReset(db, { email }, context, deliver);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(await confirm(delivered[1], 'AnotherPassword')).toEqual({ reset: true });
  });
  it.each([true, false])(
    'known=%s locked code can be replaced after 60 seconds, with identical responses',
    async (known) => {
      if (known) await registerAccount(db, input(), context);
      const delivered: string[] = [];
      const deliver = vi.fn(async (_email: string, code: string) => {
        delivered.push(code);
      });
      await requestAccountReset(db, { email }, context, deliver);
      const wrong = delivered[0] === '000008' ? '000009' : '000008';
      await Promise.all(
        Array.from({ length: 5 }, () =>
          expect(confirm(wrong)).rejects.toMatchObject({ code: 'INVALID_CODE' })
        )
      );
      await expect(confirm(delivered[0] ?? wrong)).rejects.toMatchObject({
        code: 'TOO_MANY_ATTEMPTS',
      });
      const original = await db.collection('passwordresetcodes').findOne();
      clock += 31_000;
      await expect(requestAccountReset(db, { email }, context, deliver)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 29,
      });
      expect(await db.collection('passwordresetcodes').findOne()).toEqual(original);
      clock += 29_000;
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () => requestAccountReset(db, { email }, context, deliver))
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const result of results)
        if (result.status === 'rejected')
          expect(result.reason).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 900 });
      if (known) {
        expect(delivered).toHaveLength(2);
        expect(delivered[1]).not.toBe(delivered[0]);
        expect((await db.collection('passwordresetcodes').findOne())!.attempts).toBe(0);
        await expect(confirm(delivered[0])).rejects.toMatchObject({ code: 'INVALID_CODE' });
        expect(await confirm(delivered[1])).toEqual({ reset: true });
      } else expect(deliver).not.toHaveBeenCalled();
    }
  );
  it.each([true, false])(
    'known=%s four wrong attempts cannot shorten the usable-code window',
    async (known) => {
      if (known) await registerAccount(db, input(), context);
      let delivered = '';
      await requestAccountReset(db, { email }, context, async (_email, code) => {
        delivered = code;
      });
      const wrong = delivered === '000008' ? '000009' : '000008';
      for (let i = 0; i < 4; i++)
        await expect(confirm(wrong)).rejects.toMatchObject({ code: 'INVALID_CODE' });
      clock += 60_000;
      await expect(
        requestAccountReset(db, { email }, context, async () => {})
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 840,
      });
      if (known) expect(await confirm(delivered)).toEqual({ reset: true });
    }
  );
  it.each([true, false])(
    'known=%s locked-code recovery retains the hourly send cap and rejects without changing state',
    async (known) => {
      if (known) await registerAccount(db, input(), context);
      let delivered = '';
      await requestAccountReset(db, { email }, context, async (_email, code) => {
        delivered = code;
      });
      // Fill the shared hourly counter without altering the issued-code lifecycle.
      const noSpacing = {
        ...context,
        policy: { ...accountPolicy, send: { ...accountPolicy.send, gapMs: 0 } },
      };
      for (let i = 0; i < 4; i++) await claimAccountLimit(db, noSpacing, 'send', email);
      // Even with a full hourly quota, a usable code reports the same remaining lifetime
      // for known and unknown addresses; the cap cannot expose whether a user exists.
      await expect(
        requestAccountReset(db, { email }, context, async () => {})
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 900,
      });
      const wrong = delivered === '000008' ? '000009' : '000008';
      for (let i = 0; i < 5; i++)
        await expect(confirm(wrong)).rejects.toMatchObject({ code: 'INVALID_CODE' });
      const before = await db.collection(ACCOUNT_ATTEMPTS).find().toArray();
      const original = await db.collection('passwordresetcodes').findOne();
      clock += 60_000;
      const deliver = vi.fn(async () => undefined);
      await expect(requestAccountReset(db, { email }, context, deliver)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 3540,
      });
      expect(deliver).not.toHaveBeenCalled();
      expect(await db.collection(ACCOUNT_ATTEMPTS).find().toArray()).toEqual(before);
      expect(await db.collection('passwordresetcodes').findOne()).toEqual(original);
    }
  );
  it('protects pre-existing codes and failed attempts without claiming or extending an issuance', async () => {
    await seed();
    await confirm('000008').catch(() => {});
    const original = await db.collection('passwordresetcodes').findOne();
    const limits = await db.collection(ACCOUNT_ATTEMPTS).find().toArray();
    const deliver = vi.fn(async () => undefined);
    clock += 60_000;
    await expect(requestAccountReset(db, { email }, context, deliver)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfter: 840,
    });
    expect(await db.collection('passwordresetcodes').findOne()).toEqual(original);
    expect(await db.collection(ACCOUNT_ATTEMPTS).find().toArray()).toEqual(limits);
    clock += 14 * 60_000;
    await requestAccountReset(db, { email }, context, deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
  });
  it.each(['storage failure', 'first-upsert collision'])(
    '%s rolls back the issuance quota before retry',
    async (failure) => {
      await registerAccount(db, input(), context);
      const original = db.collection.bind(db);
      const codes = db.collection('passwordresetcodes');
      let failed = false;
      const wrapped = Object.create(db) as mongo.Db;
      wrapped.collection = ((name: string) =>
        name === 'passwordresetcodes'
          ? new Proxy(codes, {
              get(target, key) {
                if (key === 'updateOne')
                  return async (...args: Parameters<typeof codes.updateOne>) => {
                    if (failed) return target.updateOne(...args);
                    failed = true;
                    if (failure === 'first-upsert collision')
                      throw new mongo.MongoServerError({ code: 11000, message: 'duplicate key' });
                    throw new Error('disk unavailable');
                  };
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            })
          : original(name)) as typeof db.collection;
      const deliver = vi.fn(async () => undefined);
      if (failure === 'storage failure') {
        await expect(requestAccountReset(wrapped, { email }, context, deliver)).rejects.toThrow(
          'disk unavailable'
        );
        expect(deliver).not.toHaveBeenCalled();
        expect(await db.collection('passwordresetcodes').countDocuments()).toBe(0);
        expect(await requestAccountReset(db, { email }, context, deliver)).toEqual({
          accepted: true,
        });
      } else {
        expect(await requestAccountReset(wrapped, { email }, context, deliver)).toEqual({
          accepted: true,
        });
      }
      expect(deliver).toHaveBeenCalledTimes(1);
    }
  );
  it('resend replaces an expired code, resets attempts, and never logs delivery secrets', async () => {
    await seed();
    await confirm('000008').catch(() => {});
    clock += 15 * 60_000;
    let latest = '';
    const deliver = vi.fn(async (_email: string, code: string) => {
      latest = code;
    });
    await requestAccountReset(db, { email }, context, deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(latest).toMatch(/^\d{6}$/);
    expect(latest).not.toBe('000007');
    expect((await db.collection('passwordresetcodes').findOne())!.attempts).toBe(0);
    // Compare exact hashes, avoiding a one-in-a-million random-code collision in the assertion.
    await db
      .collection('passwordresetcodes')
      .updateOne({}, { $set: { codeHash: createHash('sha256').update('000009').digest('hex') } });
    await expect(confirm()).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(await confirm('000009')).toEqual({ reset: true });
  });
  it('a replacement committed during old-code validation cannot be consumed by the old code', async () => {
    await seed();
    const codes = db.collection('passwordresetcodes');
    const original = db.collection.bind(db);
    let raced = false;
    const wrapped = Object.create(db) as mongo.Db;
    wrapped.collection = ((name: string) =>
      name === 'passwordresetcodes'
        ? new Proxy(codes, {
            get(target, key) {
              if (key === 'deleteOne')
                return async (...args: Parameters<typeof codes.deleteOne>) => {
                  if (!raced) {
                    raced = true;
                    await codes.updateOne(
                      {},
                      {
                        $set: {
                          codeHash: createHash('sha256').update('000009').digest('hex'),
                          attempts: 0,
                        },
                      }
                    );
                  }
                  return target.deleteOne(...args);
                };
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          })
        : original(name)) as typeof db.collection;
    await expect(
      confirmAccountReset(wrapped, { email, code: '000007', new_password: 'OldReset' }, context)
    ).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(await confirm('000009', 'NewReset')).toEqual({ reset: true });
    expect(
      await bcrypt.compare('NewReset', (await db.collection('users').findOne())!.password)
    ).toBe(true);
  });
  it('password-write failure rolls back code consumption, allowing an explicit later confirmation', async () => {
    await seed();
    const original = db.collection.bind(db);
    const users = db.collection('users');
    const wrapped = Object.create(db) as mongo.Db;
    wrapped.collection = ((name: string) =>
      name === 'users'
        ? new Proxy(users, {
            get(target, key) {
              if (key === 'updateOne')
                return async () => {
                  throw new Error('disk unavailable');
                };
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          })
        : original(name)) as typeof db.collection;
    await expect(
      confirmAccountReset(wrapped, { email, code: '000007', new_password: 'NewPassword' }, context)
    ).rejects.toThrow('disk unavailable');
    expect(await db.collection('passwordresetcodes').countDocuments()).toBe(1);
    expect(await confirm()).toEqual({ reset: true });
  });
  it.each([true, false])(
    'known=%s email uses identical cooldown without exhausting issuance at code expiry',
    async (known) => {
      if (known) await registerAccount(db, input(), context);
      const deliver = vi.fn(async () => {
        throw new Error('mail down');
      });
      expect(
        await requestAccountReset(db, { email: ' TESTER@EXAMPLE.INVALID ' }, context, deliver)
      ).toEqual({ accepted: true });
      clock += 31_000;
      await expect(requestAccountReset(db, { email }, context, deliver)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfter: 869,
      });
      // Rejections cannot consume the hourly allowance; each expiry permits a fresh email.
      clock += 869_000;
      for (let i = 0; i < 8; i++) {
        await requestAccountReset(db, { email }, context, deliver);
        clock += 15 * 60_000;
      }
      for (const doc of await db.collection(ACCOUNT_ATTEMPTS).find().toArray())
        expect(JSON.stringify(doc)).not.toContain(email);
    }
  );
  it.each([true, false])(
    'known=%s concurrent send claims allow one; rejections preserve the deadline',
    async (known) => {
      if (known) await registerAccount(db, input(), context);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => requestAccountReset(db, { email }, context, async () => {}))
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const result of results)
        if (result.status === 'rejected')
          expect(result.reason).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 900 });
      clock += 31_000;
      await expect(
        requestAccountReset(db, { email }, context, async () => {})
      ).rejects.toMatchObject({ retryAfter: 869 });
      clock += 869_000;
      expect(await requestAccountReset(db, { email }, context, async () => {})).toEqual({
        accepted: true,
      });
    }
  );
  it.each(['register', 'verify', 'source'] as const)(
    '%s with no cooldown admits an earlier timestamp arriving later without shortening expiry',
    async (kind) => {
      await claimAccountLimit(db, context, kind, email);
      const original = await db.collection(ACCOUNT_ATTEMPTS).findOne({});
      await claimAccountLimit(db, { ...context, now: () => clock - 10 }, kind, email);
      const stored = await db.collection(ACCOUNT_ATTEMPTS).findOne({});
      expect(stored?.hits).toHaveLength(2);
      expect(stored?.expiresAt).toEqual(original?.expiresAt);
    }
  );

  it('unknown emails also have ten verification requests per rolling 15 minutes', async () => {
    for (let i = 0; i < 10; i++)
      await expect(confirm()).rejects.toMatchObject({ code: 'INVALID_CODE' });
    await expect(confirm()).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 900 });
  });
  it('registration and send share twenty source requests per hour', async () => {
    context.source = '192.0.2.1';
    for (let i = 0; i < 20; i++) await claimAccountLimit(db, context, 'source', context.source);
    await expect(registerAccount(db, input(), context)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(requestAccountReset(db, { email }, context, async () => {})).rejects.toMatchObject(
      { code: 'RATE_LIMITED' }
    );
    expect(await db.collection('users').countDocuments()).toBe(0);
  });
  it('Web and HTTP share account credentials; reset invalidates old Mobile access/refresh', async () => {
    const body = (data: unknown) =>
      new Request('http://test/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    const created = await registerHttp(body(input()));
    expect(created.status).toBe(200);
    expect(created.headers.get('set-cookie')).toBeNull();
    expect(mocks.cookie).not.toHaveBeenCalled();
    expect(await loginWeb({ username: 'tester', password: ' 密碼123 ' })).toMatchObject({
      success: true,
    });
    const mobile = await loginMobile('Tester', ' 密碼123 ');
    expect(await requestPasswordReset({ email })).toMatchObject({ success: true });
    expect((await requestHttp(body({ email }))).status).toBe(429);
    const code = '000007';
    await db
      .collection('passwordresetcodes')
      .updateOne({}, { $set: { codeHash: createHash('sha256').update(code).digest('hex') } });
    const reset = await confirmHttp(body({ email, code, new_password: 'NewPassword' }));
    expect(reset.status).toBe(200);
    expect(await loginWeb({ username: 'tester', password: 'NewPassword' })).toMatchObject({
      success: true,
    });
    expect(
      await requireMobileUser(
        new Request('http://test', {
          headers: {
            authorization: `Bearer ${(await loginMobile('tester', 'NewPassword')).accessToken}`,
          },
        })
      )
    ).toMatchObject({ username: 'Tester' });
    await expect(
      requireMobileUser(
        new Request('http://test', { headers: { authorization: `Bearer ${mobile.accessToken}` } })
      )
    ).rejects.toMatchObject({ status: 401 });
    await expect(refreshMobile(mobile.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await resetPassword({ email, code, new_password: 'OtherPass' })).toMatchObject({
      success: false,
      error: 'INVALID_CODE',
    });
    // Cookie failure must not turn a committed registration into a failure.
    mocks.cookie.mockRejectedValue(new Error('cookie failure'));
    expect(
      await register({ ...input(), username: 'second', email: 'second@example.invalid' })
    ).toMatchObject({ success: true });
  });
});
