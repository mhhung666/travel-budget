// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  avatarContextSchema,
  avatarWriteInput,
  MAX_AVATAR_UPLOAD_BYTES,
} from '@travel-budget/contracts';
import {
  readAvatar,
  beginAvatarWrite,
  commandAvatarWrite,
  avatarWriteStatus,
  createWebAvatarUpload,
  setWebAvatar,
  removeWebAvatar,
  runAvatarCleanup,
} from '@/lib/avatarWrite';
import {
  up as cleanupUp,
  down as cleanupDown,
} from '../../migrations/20261011090000-avatar-cleanup-jobs.js';
import { GET as readRoute } from '@/app/api/v2/me/avatar/route';
import { POST as beginRoute } from '@/app/api/v2/me/avatar/requests/route';
import {
  GET as statusRoute,
  POST as commandRoute,
} from '@/app/api/v2/me/avatar/requests/[clientRequestId]/route';
const h = vi.hoisted(() => ({
  actor: 'a'.repeat(24),
  head: vi.fn(),
  sign: vi.fn(),
  objects: new Map<string, { size: number; contentType: string }>(),
}));
vi.mock('@/lib/storage', () => ({
  avatarPublicUrl: (key: string) => `https://cdn.example.invalid/${key}`,
  avatarKeyFromUrl: (url: string) =>
    url.startsWith('https://cdn.example.invalid/')
      ? url.slice('https://cdn.example.invalid/'.length)
      : null,
  headObject: h.head,
  presignPut: h.sign,
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
vi.mock('@/lib/mobile/session', () => ({
  requireMobileUser: async (r: Request) => {
    if (r.headers.get('authorization') !== `Bearer ${h.actor}`)
      throw new (await import('@/lib/mobile/http')).ApiError(401, 'UNAUTHORIZED');
    return { id: h.actor };
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
const uri = process.env.MONGODB_MEMBER_TEST_URI,
  allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed))
  throw new Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('M2 avatar writes on owned replica-set database', () => {
  let owned = false;
  const db = () => mongoose.connection.db!;
  const actor = () => h.actor;
  const input = async (action: 'replace' | 'remove' = 'replace') => ({
    client_request_id: randomUUID(),
    action,
    expectedRevision: (await readAvatar(db(), actor())).revision,
    ...(action === 'replace' ? { contentType: 'image/jpeg', size: 100 } : {}),
  });
  const key = async (id: string) =>
    (await db()
      .collection<{ _id: string; key: string; actor: string }>('avatarwrites')
      .findOne({ _id: `${actor()}:${id}` }))!.key as string;
  const uploaded = async (id: string) => {
    const k = await key(id);
    h.objects.set(k, { size: 100, contentType: 'image/jpeg' });
    return k;
  };
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      autoCreate: false,
      autoIndex: false,
      dbName: `tb_avatar_${randomUUID().replaceAll('-', '')}`,
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
    for (const c of ['users', 'avatarwrites', 'avatarcleanupjobs'])
      await db().collection(c).deleteMany({});
    h.actor = 'a'.repeat(24);
    h.objects.clear();
    h.head.mockReset();
    h.head.mockImplementation(async (_bucket: string, k: string) => h.objects.get(k) ?? null);
    h.sign.mockReset();
    h.sign.mockImplementation(async (_b: string, k: string) => `https://put.example.invalid/${k}`);
    await db()
      .collection('users')
      .insertMany([
        {
          _id: new mongoose.mongo.ObjectId(h.actor),
          username: 'alice',
          displayName: 'Alice',
          email: 'private@example.invalid',
          password: 'secret',
        },
        { _id: new mongoose.mongo.ObjectId('b'.repeat(24)), username: 'bob' },
      ]);
  });
  it('keeps old avatar until finish, validates actual bytes/type and replays one committed receipt after a later removal', async () => {
    const before = await db()
      .collection('users')
      .findOne({ _id: new mongoose.mongo.ObjectId(actor()) });
    const i = await input();
    await beginAvatarWrite(db(), actor(), i);
    const k = await uploaded(i.client_request_id);
    expect((await readAvatar(db(), actor())).avatarUrl).toBeNull();
    const ticket = await commandAvatarWrite(db(), actor(), i.client_request_id, 'upload');
    expect('upload' in ticket).toBe(true);
    expect(h.sign).toHaveBeenCalledWith('avatars', k, 'image/jpeg', { immutable: true });
    const results = await Promise.all([
      commandAvatarWrite(db(), actor(), i.client_request_id, 'finish'),
      commandAvatarWrite(db(), actor(), i.client_request_id, 'finish'),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].status).toBe('committed');
    const after = await db().collection('users').findOne({ _id: before!._id });
    expect(after!.avatarRevision).toBe(1);
    expect(after!.email).toBe(before!.email);
    expect(after!.password).toBe(before!.password);
    await removeWebAvatar(db(), actor());
    expect(await commandAvatarWrite(db(), actor(), i.client_request_id, 'finish')).toEqual(
      results[0]
    );
    expect(await avatarWriteStatus(db(), actor(), i.client_request_id)).toEqual(results[0]);
    expect((await readAvatar(db(), actor())).avatarUrl).toBeNull();
    expect(
      await db()
        .collection<{ _id: string; key: string; actor: string }>('avatarwrites')
        .countDocuments()
    ).toBe(1);
  });
  it('returns durable rejection for mismatched HEAD, missing upload stays retryable, and fingerprint conflicts never replace the operation', async () => {
    const i = await input();
    await beginAvatarWrite(db(), actor(), i);
    await expect(
      commandAvatarWrite(db(), actor(), i.client_request_id, 'finish')
    ).rejects.toMatchObject({ code: 'UPLOAD_INCOMPLETE' });
    h.objects.set(await key(i.client_request_id), { size: 101, contentType: 'image/jpeg' });
    const reject = await commandAvatarWrite(db(), actor(), i.client_request_id, 'finish');
    expect(reject).toMatchObject({ status: 'rejected', code: 'VALIDATION_ERROR' });
    expect(await avatarWriteStatus(db(), actor(), i.client_request_id)).toEqual(reject);
    await expect(beginAvatarWrite(db(), actor(), { ...i, size: 102 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect((await readAvatar(db(), actor())).avatarUrl).toBeNull();
  });
  it('Web/mobile share user fence, stale uploads/removals conflict, and retired keys cannot be reused', async () => {
    const native = await input(),
      staleRemove = await input('remove');
    await beginAvatarWrite(db(), actor(), native);
    const old = await uploaded(native.client_request_id);
    const web = await createWebAvatarUpload(db(), actor(), 'image/webp', 90);
    h.objects.set(web.key, { size: 90, contentType: 'image/webp' });
    await setWebAvatar(db(), actor(), web.key);
    expect(
      await commandAvatarWrite(db(), actor(), native.client_request_id, 'finish')
    ).toMatchObject({ status: 'rejected', code: 'RESOURCE_CHANGED' });
    expect(await beginAvatarWrite(db(), actor(), staleRemove)).toMatchObject({
      status: 'rejected',
      code: 'RESOURCE_CHANGED',
    });
    await expect(setWebAvatar(db(), actor(), old)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await readAvatar(db(), actor())).avatarUrl).toContain(web.key);
    await removeWebAvatar(db(), actor());
    await expect(setWebAvatar(db(), actor(), web.key)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('cancellation before begin consumes UUID without applying a remove, and cancellation after finish cannot undo it', async () => {
    const web = await createWebAvatarUpload(db(), actor(), 'image/jpeg', 100);
    h.objects.set(web.key, { size: 100, contentType: 'image/jpeg' });
    await setWebAvatar(db(), actor(), web.key);
    const remove = await input('remove');
    expect(
      await commandAvatarWrite(db(), actor(), remove.client_request_id, 'cancel')
    ).toMatchObject({ status: 'rejected', code: 'CANCELLED' });
    await beginAvatarWrite(db(), actor(), remove);
    expect((await readAvatar(db(), actor())).avatarUrl).toContain(web.key);
    const racing = await input();
    await Promise.allSettled([
      beginAvatarWrite(db(), actor(), racing),
      commandAvatarWrite(db(), actor(), racing.client_request_id, 'cancel'),
    ]);
    expect(await avatarWriteStatus(db(), actor(), racing.client_request_id)).toMatchObject({
      status: 'rejected',
      code: 'CANCELLED',
    });
    const i = await input();
    await beginAvatarWrite(db(), actor(), i);
    await uploaded(i.client_request_id);
    const done = await commandAvatarWrite(db(), actor(), i.client_request_id, 'finish');
    expect(await commandAvatarWrite(db(), actor(), i.client_request_id, 'cancel')).toEqual(done);
  });
  it('expires abandoned uploads, retries cleanup failure, sweeps twice, and preserves live references', async () => {
    await cleanupUp(db());
    await cleanupUp(db());
    const indexes = await db().collection('avatarcleanupjobs').listIndexes().toArray();
    expect(indexes.find((i) => i.name === 'avatar_cleanup_available')).toMatchObject({
      key: { availableAt: 1 },
    });
    expect(
      indexes.find((i) => i.name === 'avatar_cleanup_available')!.expireAfterSeconds
    ).toBeUndefined();
    const i = await input();
    await beginAvatarWrite(db(), actor(), i);
    const k = await uploaded(i.client_request_id);
    const web = await createWebAvatarUpload(db(), actor(), 'image/jpeg', 100);
    h.objects.set(web.key, { size: 100, contentType: 'image/jpeg' });
    await setWebAvatar(db(), actor(), web.key);
    // Artificially schedule a live reference; the worker must still protect it.
    const now = new Date(Date.now() + 25 * 60 * 60_000);
    await db()
      .collection<{ _id: string }>('avatarcleanupjobs')
      .updateOne({ _id: web.key }, { $set: { availableAt: new Date(0) } });
    const deletion = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage down'))
      .mockResolvedValue(undefined);
    expect(await runAvatarCleanup(db(), deletion, { now })).toBe(0);
    expect(await avatarWriteStatus(db(), actor(), i.client_request_id)).toMatchObject({
      clientRequestId: i.client_request_id,
      status: 'rejected',
      code: 'EXPIRED',
    });
    expect(
      await runAvatarCleanup(db(), deletion, { now: new Date(now.getTime() + 6 * 60_000) })
    ).toBe(1);
    expect(deletion).toHaveBeenLastCalledWith([k]);
    expect(
      await runAvatarCleanup(db(), deletion, { now: new Date(now.getTime() + 26 * 60 * 60_000) })
    ).toBe(1);
    expect(deletion).toHaveBeenCalledTimes(3);
    expect((await readAvatar(db(), actor())).avatarUrl).toContain(web.key);
    await expect(setWebAvatar(db(), actor(), k)).rejects.toMatchObject({ code: 'CONFLICT' });
    const rows = await db().collection('avatarcleanupjobs').countDocuments();
    await cleanupDown(db());
    await cleanupDown(db());
    expect(await db().collection('avatarcleanupjobs').countDocuments()).toBe(rows);
  });
  it('rolls back avatar/reference changes when the terminal journal insert fails', async () => {
    const web = await createWebAvatarUpload(db(), actor(), 'image/jpeg', 100);
    h.objects.set(web.key, { size: 100, contentType: 'image/jpeg' });
    await setWebAvatar(db(), actor(), web.key);
    const before = await readAvatar(db(), actor());
    const removal = await input('remove');
    const failingDb = new Proxy(db(), {
      get(target, property) {
        if (property === 'collection')
          return (name: string) => {
            const collection = target.collection(name);
            if (name !== 'avatarwrites') return collection;
            return new Proxy(collection, {
              get(c, p) {
                if (p === 'insertOne')
                  return async () => {
                    throw new Error('journal unavailable');
                  };
                const value = Reflect.get(c, p, c);
                return typeof value === 'function' ? value.bind(c) : value;
              },
            });
          };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await expect(beginAvatarWrite(failingDb, actor(), removal)).rejects.toThrow(
      'journal unavailable'
    );
    expect(await readAvatar(db(), actor())).toEqual(before);
    expect(await avatarWriteStatus(db(), actor(), removal.client_request_id)).toMatchObject({
      status: 'not_found',
    });
    expect(
      await db()
        .collection<{ _id: string }>('avatarcleanupjobs')
        .findOne({ _id: web.key, retired: true })
    ).toBeNull();
  });
  it('isolates accounts, rejects virtual/deleted users and forged HTTP bodies, uses no-store and leaves auth/profile DTOs unchanged', async () => {
    const i = await input();
    const req = (body?: unknown, auth = true) =>
      new Request('https://example.invalid/api/v2/me/avatar', {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${actor()}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const read = await readRoute(req());
    expect(avatarContextSchema.parse((await read.json()).data).avatarUrl).toBeNull();
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(read.headers.get('vary')).toBe('Authorization');
    expect((await readRoute(req(undefined, false))).status).toBe(401);
    for (const bad of [
      { ...i, actor: 'b'.repeat(24) },
      { ...i, size: 0 },
      { ...i, size: MAX_AVATAR_UPLOAD_BYTES + 1 },
      { ...i, contentType: 'image/svg+xml' },
    ]) {
      expect(avatarWriteInput.safeParse(bad).success).toBe(false);
      expect((await beginRoute(req(bad))).status).toBe(400);
    }
    expect((await beginRoute(req(i))).status).toBe(200);
    const params = { params: Promise.resolve({ clientRequestId: i.client_request_id }) };
    await uploaded(i.client_request_id);
    expect((await commandRoute(req({ action: 'finish' }), params)).status).toBe(200);
    expect((await statusRoute(req(), params)).status).toBe(200);
    h.actor = 'b'.repeat(24);
    expect(await avatarWriteStatus(db(), actor(), i.client_request_id)).toMatchObject({
      status: 'not_found',
    });
    await expect(
      setWebAvatar(
        db(),
        actor(),
        await db()
          .collection<{ _id: string; key: string; actor: string }>('avatarwrites')
          .findOne({ actor: 'a'.repeat(24) })
          .then((r) => r!.key)
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await db()
      .collection('users')
      .updateOne({ _id: new mongoose.mongo.ObjectId(actor()) }, { $set: { isVirtual: true } });
    expect((await readRoute(req())).status).toBe(404);
    await db()
      .collection('users')
      .deleteOne({ _id: new mongoose.mongo.ObjectId(actor()) });
    await expect(readAvatar(db(), actor())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
