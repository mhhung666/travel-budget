import { expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/api/client';
import { SessionManager } from '@/api/session';
import {
  notificationPreferencesInput,
  notificationPreferencesSchema,
} from '@travel-budget/contracts';
import { NotificationEditor } from './NotificationEditor';
const user = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const other = { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob' };
const initial = { notifyByEmail: true, locale: 'zh' as const };
const ok = (data: unknown) => Response.json({ data });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
async function setup(handler?: (init?: RequestInit) => Promise<Response>) {
  let stored = { ...initial } as { notifyByEmail: boolean; locale: string };
  let available = true;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/login')) {
      const account = JSON.parse(String(init?.body)).username === 'bob' ? other : user;
      return ok({ user: account, accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
    }
    if (handler) return handler(init);
    if (init?.method === 'PATCH') stored = { ...stored, ...JSON.parse(String(init.body)) };
    return ok(stored);
  });
  const store = { get: async () => null, set: vi.fn(async () => {}), clear: async () => {} };
  const manager = new SessionManager(
    new ApiClient('https://example.invalid/api/v2', fetcher),
    store,
    async () => {}
  );
  await manager.login('alice', 'password');
  const editor = new NotificationEditor(manager, () => available);
  return {
    manager,
    editor,
    fetcher,
    store,
    server: () => stored,
    online: (v: boolean) => {
      available = v;
    },
    remote: (v: Partial<typeof stored>) => {
      stored = { ...stored, ...v };
    },
  };
}
const writes = (h: Awaited<ReturnType<typeof setup>>) =>
  h.fetcher.mock.calls.filter(([, i]) => i?.method === 'PATCH');
it('strictly validates partial preferences and rejects empty, arbitrary languages, targets and leaked data', () => {
  for (const value of [
    {},
    { locale: 'ja' },
    { notifyByEmail: 'false' },
    { locale: 'en', actorId: user.id },
  ])
    expect(notificationPreferencesInput.safeParse(value).success).toBe(false);
  expect(notificationPreferencesInput.parse({ notifyByEmail: false })).toEqual({
    notifyByEmail: false,
  });
  expect(notificationPreferencesSchema.safeParse({ ...initial, email: 'secret' }).success).toBe(
    false
  );
});
it('explicitly saves only changed fields, prevents double taps, and accepts actual current settings without storing private preferences', async () => {
  const h = await setup();
  await h.editor.read();
  h.remote({ locale: 'jp' });
  h.editor.edit({ notifyByEmail: false });
  expect(h.server().notifyByEmail).toBe(true);
  await Promise.all([h.editor.save(), h.editor.save()]);
  expect(writes(h)).toHaveLength(1);
  expect(JSON.parse(String(writes(h)[0][1]?.body))).toEqual({ notifyByEmail: false });
  expect(h.editor.getSnapshot()).toMatchObject({
    result: 'saved',
    draft: { notifyByEmail: false, locale: 'jp' },
  });
  expect(h.store.set).toHaveBeenCalledTimes(1); // login only, no credential or preference writes
  const restarted = new NotificationEditor(h.manager, () => true);
  expect(restarted.getSnapshot().draft).toBeUndefined();
  await restarted.read();
  expect(restarted.getSnapshot().draft).toEqual(h.server());
});
it('updates notification language even with Email off and never changes session identity', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit({ locale: 'en', notifyByEmail: false });
  await h.editor.save();
  expect(h.editor.getSnapshot().result).toBe('saved');
  expect(h.manager.getSnapshot().user).toEqual(user);
  expect(h.server()).toEqual({ locale: 'en', notifyByEmail: false });
});
it('failed reads show no fabricated values; retry loads server defaults', async () => {
  let fail = true;
  const h = await setup(async () =>
    fail ? Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 }) : ok(initial)
  );
  await h.editor.read();
  expect(h.editor.getSnapshot().draft).toBeUndefined();
  await h.editor.save();
  expect(writes(h)).toHaveLength(0);
  fail = false;
  await h.editor.read();
  expect(h.editor.getSnapshot().draft).toEqual(initial);
});
it('preserves unsaved input on an ordinary refresh but updates untouched settings', async () => {
  const h = await setup();
  await h.editor.read();
  h.remote({ locale: 'jp' });
  await h.editor.read();
  expect(h.editor.getSnapshot().draft?.locale).toBe('jp');
  h.editor.edit({ locale: 'en' });
  h.remote({ locale: 'zh-CN', notifyByEmail: false });
  await h.editor.read();
  expect(h.editor.getSnapshot()).toMatchObject({
    draft: { locale: 'en', notifyByEmail: false },
    preferences: { locale: 'zh-CN', notifyByEmail: false },
  });
});
it('lost responses block further writes; failed lookup stays blocked, successful lookup shows current rather than claiming the original write succeeded', async () => {
  let current: unknown = initial,
    lookupFails = false;
  const h = await setup(async (init) => {
    if (init?.method === 'PATCH') {
      current = { ...initial, locale: 'en' };
      lookupFails = true;
      throw Error('response lost');
    }
    if (lookupFails) throw Error('offline');
    return ok(current);
  });
  await h.editor.read();
  h.editor.edit({ locale: 'en' });
  await h.editor.save();
  expect(h.editor.getSnapshot()).toMatchObject({ uncertain: true, result: undefined });
  h.editor.edit({ locale: 'jp' });
  await h.editor.read();
  await h.editor.save();
  expect(h.editor.getSnapshot().uncertain).toBe(true);
  expect(writes(h)).toHaveLength(1);
  lookupFails = false;
  await h.editor.read();
  expect(h.editor.getSnapshot()).toMatchObject({
    uncertain: false,
    result: 'current',
    draft: { locale: 'en' },
  });
});
it('offline/background guards send nothing and retain input; disposal prevents reads and writes', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit({ locale: 'en' });
  h.online(false);
  const count = h.fetcher.mock.calls.length;
  await h.editor.save();
  await h.editor.read();
  expect(h.fetcher).toHaveBeenCalledTimes(count);
  expect(h.editor.getSnapshot()).toMatchObject({
    uncertain: false,
    draft: { locale: 'en' },
    error: { code: 'PROFILE_OFFLINE' },
  });
  h.online(true);
  h.editor.dispose();
  await h.editor.save();
  expect(writes(h)).toHaveLength(0);
});
it.each(['read', 'save'] as const)(
  'ignores late %s after A→B→A and starts a new account with no previous draft',
  async (method) => {
    const late = deferred<Response>();
    let delay = false;
    const h = await setup(async () => (delay ? late.promise : ok(initial)));
    await h.editor.read();
    h.editor.edit({ locale: 'en' });
    delay = true;
    const pending = h.editor[method]();
    await h.manager.login('bob', 'password');
    const otherEditor = new NotificationEditor(h.manager, () => true);
    expect(otherEditor.getSnapshot().preferences).toBeUndefined();
    await h.manager.login('alice', 'password');
    late.resolve(ok({ notifyByEmail: false, locale: 'en' }));
    await pending;
    expect(h.editor.getSnapshot().result).toBeUndefined();
    expect(h.manager.getSnapshot().user).toEqual(user);
    expect(h.editor.getSnapshot().preferences).toEqual(initial);
  }
);
it('429 retains draft, remains definite and respects the client Retry-After cooldown', async () => {
  const h = await setup(async (init) =>
    init?.method === 'PATCH'
      ? Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '120' } }
        )
      : ok(initial)
  );
  await h.editor.read();
  h.editor.edit({ locale: 'en' });
  await h.editor.save();
  await h.editor.save();
  expect(writes(h)).toHaveLength(1);
  expect(h.editor.getSnapshot()).toMatchObject({
    draft: { locale: 'en' },
    uncertain: false,
    error: { retryAfter: 120 },
  });
});
it('definite validation rejection keeps input editable without showing success', async () => {
  const h = await setup(async (init) =>
    init?.method === 'PATCH'
      ? Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 })
      : ok(initial)
  );
  await h.editor.read();
  h.editor.edit({ locale: 'en' });
  await h.editor.save();
  expect(h.editor.getSnapshot()).toMatchObject({
    uncertain: false,
    result: undefined,
    error: new ApiError('VALIDATION_ERROR', 400),
  });
  h.editor.edit({ locale: 'jp' });
  expect(h.editor.getSnapshot().draft?.locale).toBe('jp');
});
