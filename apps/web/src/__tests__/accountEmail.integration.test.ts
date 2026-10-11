// @vitest-environment node
import { randomUUID, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { User, EmailChangeCode } from '@/models';
import { requestAccountEmail, confirmAccountEmail, cancelAccountEmail } from '@/lib/accountEmail';
import { requestAccountReset, confirmAccountReset } from '@/lib/accountEntry';
import { requestEmailChange, confirmEmailChange, cancelEmailChange } from '@/actions/auth.actions';
import { loginMobile, refreshMobile } from '@/lib/mobile/session';
import { POST as requestEmail } from '@/app/api/v2/me/email/request/route';
import { POST as confirmEmail } from '@/app/api/v2/me/email/confirm/route';
import { POST as cancelEmail } from '@/app/api/v2/me/email/cancel/route';
const h = vi.hoisted(() => ({ actor: '', code: '', send: vi.fn(async () => true) }));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
vi.mock('@/lib/auth', () => ({
  getSession: async () => ({ userId: h.actor }),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'isolated-email-secret-at-least-32-characters' }),
}));
vi.mock('@/lib/email', () => ({ sendEmail: h.send }));
vi.mock('@/lib/emailTemplates', () => ({
  buildEmailChangeEmail: async ({ code }: { code: string }) => {
    h.code = code;
    return { subject: 'test', html: 'test', text: 'test' };
  },
  buildPasswordResetEmail: vi.fn(),
}));
const uri = process.env.MONGODB_MEMBER_TEST_URI,
  allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('M3b on an owned isolated replica set database', () => {
  let owned = false,
    id: string,
    time: number;
  const db = () => mongoose.connection.db!;
  const context = () => ({
    secret: 'isolated-email-secret-at-least-32-characters',
    now: () => time,
  });
  let code = '';
  const deliver = vi.fn(async (_email: string, value: string) => {
    code = value;
    return true;
  });
  const send = (email = 'new@example.com', delivery = deliver) =>
    requestAccountEmail(db(), id, { new_email: email }, context(), delivery);
  const confirm = (value = code, email = 'new@example.com') =>
    confirmAccountEmail(db(), id, { new_email: email, code: value }, context());
  const current = () =>
    db()
      .collection('users')
      .findOne({ _id: new mongoose.mongo.ObjectId(id) });
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      autoCreate: false,
      autoIndex: false,
      dbName: `tb_email_${randomUUID().replaceAll('-', '')}`,
    });
    expect(await db().listCollections().toArray()).toHaveLength(0);
    await db().createCollection('verification_owner');
    owned = true;
    await User.createIndexes();
    await EmailChangeCode.createIndexes();
    await db().createCollection('accountentryattempts');
    await db().createCollection('mobilesessions');
    await db().createCollection('mobileloginattempts');
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
      'emailchangecodes',
      'accountentryattempts',
      'mobilesessions',
      'mobileloginattempts',
      'passwordresetcodes',
    ])
      await db().collection(c).deleteMany({});
    time = Date.now();
    deliver.mockClear();
    h.send.mockReset().mockResolvedValue(true);
    const user = await User.create({
      username: 'alice',
      displayName: 'Alice',
      email: 'old@example.com',
      password: await bcrypt.hash('password', 10),
    });
    id = user._id.toString();
    h.actor = id;
  });
  it('normalizes, delivers without changing the account, atomically consumes once and leaves sessions valid', async () => {
    const token = await loginMobile('alice', 'password');
    await db()
      .collection('passwordresetcodes')
      .insertOne({
        user: new mongoose.mongo.ObjectId(id),
        codeHash: createHash('sha256').update('012345').digest('hex'),
        expiresAt: new Date(time + 900000),
        attempts: 0,
      });
    expect(await send('NEW@example.com')).toEqual({ sent: true, newEmail: 'new@example.com' });
    expect((await current())!.email).toBe('old@example.com');
    const record = await db().collection('emailchangecodes').findOne();
    expect(JSON.stringify(record)).not.toContain(code);
    expect(code).toMatch(/^\d{6}$/);
    const results = await Promise.allSettled([confirm(), confirm()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await current())!.email).toBe('new@example.com');
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(0);
    expect(await db().collection('passwordresetcodes').countDocuments()).toBe(0);
    await expect(refreshMobile(token.refreshToken)).resolves.toHaveProperty('accessToken');
    await expect(confirm()).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
  it('a delayed reset issued to the previous mailbox cannot verify against the new email or block its reset code', async () => {
    await send();
    const emailCode = code;
    const users = db().collection('users'),
      originalCollection = db().collection.bind(db()),
      originalFind = users.findOne.bind(users);
    let entered!: () => void,
      release!: () => void,
      paused = false,
      resetCode = '';
    const oldDelivery = vi.fn();
    const ready = new Promise<void>((r) => {
        entered = r;
      }),
      hold = new Promise<void>((r) => {
        release = r;
      });
    const find = vi.spyOn(users, 'findOne').mockImplementation(async (...args) => {
      const user = await originalFind(...args);
      if (args[0].email === 'old@example.com' && !paused) {
        paused = true;
        entered();
        await hold;
      }
      return user;
    });
    const collection = vi
      .spyOn(db(), 'collection')
      .mockImplementation((name, options) =>
        name === 'users' ? users : originalCollection(name, options)
      );
    try {
      const pending = requestAccountReset(
        db(),
        { email: 'old@example.com' },
        context(),
        oldDelivery
      );
      await ready;
      await confirm(emailCode);
      await requestAccountReset(
        db(),
        { email: 'new@example.com' },
        context(),
        async (_email, value) => {
          resetCode = value;
        }
      );
      release();
      await pending;
      expect(oldDelivery).not.toHaveBeenCalled();
    } finally {
      collection.mockRestore();
      find.mockRestore();
    }
    await expect(
      confirmAccountReset(
        db(),
        { email: 'new@example.com', code: resetCode, new_password: 'new password' },
        context()
      )
    ).resolves.toEqual({ reset: true });
    await db()
      .collection('passwordresetcodes')
      .insertOne({
        user: new mongoose.mongo.ObjectId(id),
        email: 'old@example.com',
        codeHash: createHash('sha256').update('012345').digest('hex'),
        expiresAt: new Date(time + 900000),
        attempts: 0,
      });
    await expect(
      confirmAccountReset(
        db(),
        { email: 'new@example.com', code: '012345', new_password: 'different password' },
        context()
      )
    ).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
  it('rolls back email and code together when code consumption fails after the account update', async () => {
    await send();
    const codes = db().collection('emailchangecodes'),
      original = db().collection.bind(db());
    const remove = vi
      .spyOn(codes, 'deleteOne')
      .mockRejectedValueOnce(new Error('injected consumption failure'));
    const collection = vi
      .spyOn(db(), 'collection')
      .mockImplementation((name, options) =>
        name === 'emailchangecodes' ? codes : original(name, options)
      );
    try {
      await expect(confirm()).rejects.toThrow('injected consumption failure');
    } finally {
      collection.mockRestore();
      remove.mockRestore();
    }
    expect((await current())!.email).toBe('old@example.com');
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(1);
    await expect(confirm()).resolves.toHaveProperty('changed', true);
  });
  it('resend replaces only after delivery; delivery failure retains old code, expiry and attempts', async () => {
    await send();
    const first = code;
    await confirm(first === '000000' ? '111111' : '000000').catch(() => {});
    const before = await db().collection('emailchangecodes').findOne();
    time += 61000;
    await expect(
      send(
        'new@example.com',
        vi.fn(async () => false)
      )
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    const after = await db().collection('emailchangecodes').findOne();
    expect(after!.codeHash).toBe(before!.codeHash);
    expect(after!.attempts).toBe(1);
    expect(after!.expiresAt).toEqual(before!.expiresAt);
    await expect(confirm(first)).resolves.toHaveProperty('changed', true);
  });
  it('late delivery cannot resurrect a cancelled candidate or supersede an already confirmed old code', async () => {
    await send();
    const first = code;
    time += 61000;
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const hold = new Promise<void>((r) => {
      release = r;
    });
    const sending = send(
      'later@example.com',
      vi.fn(async () => {
        entered();
        await hold;
        return true;
      })
    );
    await ready;
    await confirm(first);
    release();
    await expect(sending).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect((await current())!.email).toBe('new@example.com');
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(0);
    time += 61000;
    const readyAgain = new Promise<void>((r) => {
      entered = r;
    });
    const waiting = send(
      'later@example.com',
      vi.fn(async () => {
        const held = new Promise<void>((r) => {
          release = r;
        });
        entered();
        await held;
        return true;
      })
    );
    await readyAgain;
    await cancelAccountEmail(db(), id);
    release();
    await expect(waiting).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(0);
    time += 61000;
    const thirdReady = new Promise<void>((r) => {
      entered = r;
    });
    const superseded = send(
      'superseded@example.com',
      vi.fn(async () => {
        const held = new Promise<void>((r) => {
          release = r;
        });
        entered();
        await held;
        return true;
      })
    );
    await thirdReady;
    time += 61000;
    await send('latest@example.com');
    const latestCode = code;
    release();
    await expect(superseded).rejects.toMatchObject({ code: 'RESOURCE_CHANGED' });
    await expect(confirm(latestCode, 'latest@example.com')).resolves.toHaveProperty(
      'email',
      'latest@example.com'
    );
  });
  it('five wrong attempts lock atomically, expiration is strict and successful resend invalidates old code', async () => {
    await send();
    const old = code,
      wrong = old === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 5 }, () => confirm(wrong).catch((e) => e)));
    expect((await db().collection('emailchangecodes').findOne())!.attempts).toBe(5);
    await expect(confirm(old)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    time += 61000;
    await send();
    const next = code;
    expect(next).not.toBe(old);
    await expect(confirm(old)).rejects.toMatchObject({ code: 'INVALID_CODE' });
    time += 900000;
    await expect(confirm(next)).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
    expect((await current())!.email).toBe('old@example.com');
  });
  it('two accounts claiming the same email have one winner; conflict does not consume the loser code or partially change it', async () => {
    await send();
    const aliceCode = code,
      aliceId = id;
    const bob = await User.create({
      username: 'bob',
      displayName: 'Bob',
      email: 'bob@example.com',
      password: 'hash',
    });
    id = bob._id.toString();
    await send();
    const bobCode = code;
    const results = await Promise.allSettled([
      confirmAccountEmail(
        db(),
        aliceId,
        { new_email: 'new@example.com', code: aliceCode },
        context()
      ),
      confirm(bobCode),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'CONFLICT' },
    });
    expect(await db().collection('users').countDocuments({ email: 'new@example.com' })).toBe(1);
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(1);
  });
  it('legacy codes retain their original expiry during failed resend; displayed target and original email must match', async () => {
    const expiry = new Date(time + 120000);
    await db()
      .collection('emailchangecodes')
      .insertOne({
        user: new mongoose.mongo.ObjectId(id),
        newEmail: 'new@example.com',
        codeHash: createHash('sha256').update('012345').digest('hex'),
        expiresAt: expiry,
        attempts: 0,
      });
    await expect(
      send(
        'other@example.com',
        vi.fn(async () => false)
      )
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' });
    expect((await db().collection('emailchangecodes').findOne())!.expiresAt).toEqual(expiry);
    await expect(confirm('012345', 'other@example.com')).rejects.toMatchObject({
      code: 'RESOURCE_CHANGED',
    });
    await expect(
      confirmAccountEmail(db(), id, { code: '012345' }, context())
    ).resolves.toHaveProperty('email', 'new@example.com');
    time += 61000;
    await send('other@example.com');
    await db()
      .collection('users')
      .updateOne(
        { _id: new mongoose.mongo.ObjectId(id) },
        { $set: { email: 'externally@example.com' } }
      );
    await expect(confirm(code, 'other@example.com')).rejects.toMatchObject({
      code: 'RESOURCE_CHANGED',
    });
  });
  it('shared Web/native send quota is actor-scoped, separate from verify and E2, not forwarded headers or destination', async () => {
    expect(await requestEmailChange({ new_email: 'new@example.com' })).toMatchObject({
      success: true,
    });
    await expect(send()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(await confirmEmailChange({ new_email: 'new@example.com', code: h.code })).toMatchObject({
      success: true,
      data: { email: 'new@example.com' },
    });
    expect(await cancelEmailChange()).toMatchObject({ success: true });
    // Destination rotation cannot bypass the same actor's hourly budget.
    time += 61000;
    for (let i = 0; i < 4; i++) {
      await send(`next${i}@example.com`);
      time += 61000;
    }
    await expect(send('other@example.com')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('strict HTTP bearer-self boundaries, cancellation and real errors never expose email in ordinary auth DTOs', async () => {
    const token = await loginMobile('alice', 'password');
    const req = (path: string, body: unknown, bearer = true) =>
      new Request(`https://example.invalid/api/v2/me/email/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearer
            ? { Authorization: `Bearer ${token.accessToken}` }
            : { Cookie: 'session=forged' }),
        },
        body: JSON.stringify(body),
      });
    expect(
      (await requestEmail(req('request', { new_email: 'new@example.com' }, false))).status
    ).toBe(401);
    expect(
      (await requestEmail(req('request', { new_email: 'new@example.com', userId: id }))).status
    ).toBe(400);
    const sent = await requestEmail(req('request', { new_email: 'new@example.com' }));
    expect(sent.status).toBe(200);
    expect(sent.headers.get('Cache-Control')).toBe('no-store');
    const limited = await requestEmail(req('request', { new_email: 'new@example.com' }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(
      (await confirmEmail(req('confirm', { new_email: 'new@example.com', code: h.code }))).status
    ).toBe(200);
    expect((await cancelEmail(req('cancel', {}))).status).toBe(200);
    expect(token.user).not.toHaveProperty('email');
  });
  it('no configured sender or failed delivery never reports sent; virtual/deleted owners cannot mutate another account', async () => {
    h.send.mockResolvedValue(false);
    expect(await requestEmailChange({ new_email: 'new@example.com' })).toMatchObject({
      success: false,
      error: 'EMAIL_DELIVERY_FAILED',
    });
    expect((await current())!.email).toBe('old@example.com');
    expect(await db().collection('emailchangecodes').countDocuments()).toBe(0);
    await db()
      .collection('users')
      .updateOne({ _id: new mongoose.mongo.ObjectId(id) }, { $set: { isVirtual: true } });
    await expect(cancelAccountEmail(db(), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await db().collection('users').deleteMany({});
    await expect(cancelAccountEmail(db(), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
