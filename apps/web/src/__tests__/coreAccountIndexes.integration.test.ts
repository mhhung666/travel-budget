// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const boundaries = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSession: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(true),
  emailTemplate: vi.fn().mockResolvedValue({ subject: 'test', html: 'test' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ ...boundaries, deleteSession: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: boundaries.sendEmail }));
vi.mock('@/lib/emailTemplates', () => ({
  buildEmailChangeEmail: boundaries.emailTemplate,
  buildPasswordResetEmail: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/models', async () => ({
  ...(await import('@/models/User')),
  ...(await import('@/models/EmailChangeCode')),
  ...(await import('@/models/PasswordResetCode')),
}));
import { User } from '@/models/User';
import { EmailChangeCode } from '@/models/EmailChangeCode';
import { register, login, requestEmailChange, confirmEmailChange } from '@/actions/auth.actions';
import { up } from '../../migrations/20260905093000-core-query-indexes.js';

const uri = process.env.MONGODB_INDEX_TEST_URI;
const allowed = process.env.MONGODB_INDEX_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Explicit isolated URI and write opt-in required');

describe.skipIf(!uri || !allowed)('core indexes: real MongoDB account actions', () => {
  let owned = false;
  beforeAll(async () => {
    // Never use the app connection or the database named by the supplied URI.
    await mongoose.connect(uri!, {
      dbName: `tb_account_verify_${randomUUID().replaceAll('-', '')}`,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = mongoose.connection.db!;
    expect(await db.listCollections().toArray()).toHaveLength(0);
    await db.createCollection('verification_owner');
    owned = true;
    await up(db);
    await EmailChangeCode.createIndexes();
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    boundaries.getSession.mockResolvedValue(null);
    await User.deleteMany({});
    await EmailChangeCode.deleteMany({});
  });
  const input = (username: string, email = `${username}@example.com`) => ({
    username,
    email,
    display_name: username,
    password: 'Password123!',
  });

  // Both requests pass their real DB preflight before either writes. No fake E11000.
  function barrier() {
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    return async () => {
      if (++arrivals === 2) release();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Race barrier timed out')), 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
  }

  it('registers with a real password hash, logs in case-insensitively and rejects duplicates', async () => {
    expect(await register(input('Traveller'))).toMatchObject({ success: true });
    const user = await User.findOne().lean();
    expect(user!.password).not.toBe('Password123!');
    expect(await login({ username: 'TRAVELLER', password: 'Password123!' })).toMatchObject({
      success: true,
    });
    expect(await login({ username: 'traveller', password: 'wrong' })).toMatchObject({
      success: false,
    });
    expect(await register(input('TRAVELLER', 'other@example.com'))).toMatchObject({
      code: 'CONFLICT',
    });
    expect(await register(input('different', 'TRAVELLER@example.com'))).toMatchObject({
      code: 'CONFLICT',
    });
    expect(await User.countDocuments()).toBe(1);
    expect(boundaries.createSession).toHaveBeenCalledTimes(2);
  });

  it.each(['username', 'email'] as const)(
    'maps real concurrent registration %s violations to CONFLICT',
    async (field) => {
      const wait = barrier();
      const create = User.create.bind(User);
      vi.spyOn(User, 'create').mockImplementation((async (
        doc: Parameters<typeof User.create>[0]
      ) => {
        await wait();
        return create(doc);
      }) as typeof User.create);
      const first = input('RaceFirst');
      const second = input('RaceSecond');
      first[field] = field === 'username' ? 'SameName' : 'same@example.com';
      second[field] = first[field].toUpperCase();
      const results = await Promise.all([register(first), register(second)]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(results.filter((r) => !r.success)).toEqual([
        { success: false, error: 'CONFLICT', code: 'CONFLICT' },
      ]);
      expect(await User.countDocuments()).toBe(1);
      expect(boundaries.createSession).toHaveBeenCalledTimes(1);
    }
  );

  it('runs request/confirm email change, validates the code and prevents code reuse', async () => {
    await register(input('EmailOwner'));
    const user = await User.findOne().lean();
    boundaries.getSession.mockResolvedValue({ userId: user!._id.toString() });
    expect(await requestEmailChange({ new_email: 'NEW@example.com' })).toMatchObject({
      success: true,
    });
    const code = boundaries.emailTemplate.mock.calls[0][0].code as string;
    expect(boundaries.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@example.com' })
    );
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await confirmEmailChange({ code: wrong })).toMatchObject({ error: 'INVALID_CODE' });
    expect((await EmailChangeCode.findOne())!.attempts).toBe(1);
    expect(await confirmEmailChange({ code })).toMatchObject({ success: true });
    expect((await User.findById(user!._id))!.email).toBe('new@example.com');
    expect(await EmailChangeCode.countDocuments()).toBe(0);
    expect(await confirmEmailChange({ code })).toMatchObject({ error: 'INVALID_CODE' });
  });

  it('maps a real email confirmation race to CONFLICT without partial account writes', async () => {
    await register(input('OwnerOne'));
    await register(input('OwnerTwo'));
    const users = await User.find().sort({ username: 1 }).lean();
    const codes: string[] = [];
    for (const user of users) {
      boundaries.getSession.mockResolvedValue({ userId: user._id.toString() });
      expect(await requestEmailChange({ new_email: 'shared@example.com' })).toMatchObject({
        success: true,
      });
      codes.push(boundaries.emailTemplate.mock.calls.at(-1)![0].code);
    }
    const wait = barrier();
    const update = User.updateOne.bind(User);
    vi.spyOn(User, 'updateOne').mockImplementation(((
      ...args: Parameters<typeof User.updateOne>
    ) => {
      return wait().then(() => update(...args));
    }) as unknown as typeof User.updateOne);
    boundaries.getSession
      .mockResolvedValueOnce({ userId: users[0]._id.toString() })
      .mockResolvedValueOnce({ userId: users[1]._id.toString() });
    const results = await Promise.all(codes.map((code) => confirmEmailChange({ code })));
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toEqual([
      { success: false, error: 'CONFLICT', code: 'CONFLICT' },
    ]);
    expect(await User.countDocuments({ email: 'shared@example.com' })).toBe(1);
    const loser = results.findIndex((r) => !r.success);
    expect((await User.findById(users[loser]._id))!.email).toBe(users[loser].email);
    expect(await EmailChangeCode.countDocuments()).toBe(1);
  });
});
