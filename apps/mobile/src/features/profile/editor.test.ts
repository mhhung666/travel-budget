import { expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/api/client';
import { SessionManager, type CredentialStore } from '@/api/session';
import { decodeCredential, encodeCredential } from '@/storage/sessionCredential';
import { ProfileEditor } from './editor';
const user = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const other = { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob' };
const profile = (displayName = 'Alice') => ({
  ...user,
  displayName,
  email: 'private@example.invalid',
});
const session = (account = user, token = 'refresh') => ({
  user: account,
  refreshToken: token,
  accessToken: 'access',
  expiresIn: 900,
});
const ok = (data: unknown) => Response.json({ data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
async function setup(handler?: (url: string, init?: RequestInit) => Promise<Response>) {
  let saved = '';
  let server = profile();
  let failStorage = false;
  let available = true;
  const store: CredentialStore = {
    get: async () => decodeCredential(saved).token,
    getLocalUser: async () => decodeCredential(saved).user,
    set: vi.fn(async (token, identity) => {
      if (failStorage) throw new ApiError('STORAGE');
      saved = encodeCredential(token, identity);
    }),
    clear: async () => {
      saved = '';
    },
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (handler) return handler(url, init);
    if (url.endsWith('/login'))
      return ok(session(JSON.parse(String(init?.body)).username === 'bob' ? other : user));
    if (url.endsWith('/refresh'))
      return ok(session({ ...user, displayName: server.displayName }, 'rotated'));
    if (init?.method === 'PATCH') server = profile(JSON.parse(String(init.body)).displayName);
    return ok(server);
  });
  const manager = new SessionManager(
    new ApiClient('https://example.invalid/api/v1', fetcher),
    store,
    async () => {}
  );
  await manager.login('alice', 'password');
  const editor = new ProfileEditor(manager, () => available);
  return {
    manager,
    editor,
    fetcher,
    store,
    credential: () => decodeCredential(saved),
    fail: (v: boolean) => {
      failStorage = v;
    },
    online: (v: boolean) => {
      available = v;
    },
    server: () => server,
  };
}
it('saves trimmed names explicitly, syncs identity atomically, and restores the new name after restart', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit('  New Alice  ');
  expect(h.server().displayName).toBe('Alice');
  await Promise.all([h.editor.save(), h.editor.save()]);
  expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
  expect(h.manager.getSnapshot().user?.displayName).toBe('New Alice');
  expect(h.credential().user?.displayName).toBe('New Alice');
  expect(JSON.stringify(h.credential())).not.toContain('private@example.invalid');
  const restarted = new SessionManager(h.manager.api, h.store, async () => {});
  await restarted.restore();
  expect(restarted.getSnapshot().user?.displayName).toBe('New Alice');
  expect(h.editor.getSnapshot().result).toBe('saved');
});
it('validates blanks and length, and cancels unsaved input without any write', async () => {
  const h = await setup();
  await h.editor.read();
  for (const name of ['   ', 'x'.repeat(101)]) {
    h.editor.edit(name);
    await h.editor.save();
    expect(h.editor.getSnapshot().error).toMatchObject({ code: 'PROFILE_NAME_INVALID' });
  }
  h.editor.edit('Not saved');
  h.editor.dispose();
  await h.editor.save();
  expect(h.fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
});
it('never starts an offline read/save, and preserves the input', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit('New');
  h.online(false);
  const count = h.fetcher.mock.calls.length;
  await h.editor.save();
  await h.editor.read();
  expect(h.fetcher).toHaveBeenCalledTimes(count);
  expect(h.editor.getSnapshot()).toMatchObject({
    name: 'New',
    uncertain: false,
    error: { code: 'PROFILE_OFFLINE' },
  });
});
it('a lost response blocks a second PATCH until an explicit read; current values resolve the uncertainty', async () => {
  let current = profile(),
    writes = 0;
  const h = await setup(async (url, init) => {
    if (url.endsWith('/login')) return ok(session());
    if (init?.method === 'PATCH') {
      writes++;
      current = profile(JSON.parse(String(init.body)).displayName);
      throw Error('lost response');
    }
    return ok(current);
  });
  await h.editor.read();
  h.editor.edit('New');
  await h.editor.save();
  expect(h.editor.getSnapshot().uncertain).toBe(true);
  await h.editor.save();
  expect(writes).toBe(1);
  await h.editor.read();
  expect(h.editor.getSnapshot()).toMatchObject({
    uncertain: false,
    profile: { displayName: 'New' },
    result: 'current',
  });
  expect(h.credential().user?.displayName).toBe('New');
  expect(writes).toBe(1);
});
it('a failed uncertainty lookup keeps the write blocked and does not assume failure', async () => {
  let fail = false;
  const h = await setup(async (url) => {
    if (url.endsWith('/login')) return ok(session());
    if (fail) return Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
    return ok(profile());
  });
  await h.editor.read();
  fail = true;
  h.editor.edit('New');
  await h.editor.save();
  await h.editor.read();
  await h.editor.save();
  expect(h.editor.getSnapshot().uncertain).toBe(true);
  expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
});
it('server success with local storage failure stays successful; local retry never resubmits', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit('New');
  h.fail(true);
  await h.editor.save();
  expect(h.editor.getSnapshot()).toMatchObject({
    result: 'saved',
    localFailed: true,
    uncertain: false,
  });
  expect(h.manager.getSnapshot().user?.displayName).toBe('New');
  expect(h.credential().user?.displayName).toBe('Alice');
  h.fail(false);
  await h.editor.retryLocal();
  expect(h.credential().user?.displayName).toBe('New');
  expect(h.editor.getSnapshot().localFailed).toBe(false);
  expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
});
it('a late response after switching accounts, including A→B→A, cannot change identity or screen', async () => {
  const response = deferred<Response>();
  const h = await setup(async (url, init) => {
    if (url.endsWith('/login'))
      return ok(session(JSON.parse(String(init?.body)).username === 'bob' ? other : user));
    if (init?.method === 'PATCH') return response.promise;
    return ok(profile());
  });
  await h.editor.read();
  h.editor.edit('Late');
  const saving = h.editor.save();
  await h.manager.login('bob', 'password');
  await h.manager.login('alice', 'password');
  response.resolve(ok(profile('Late')));
  await saving;
  expect(h.manager.getSnapshot().user?.displayName).toBe('Alice');
  expect(h.credential().user?.displayName).toBe('Alice');
  expect(h.editor.getSnapshot().result).toBeUndefined();
});
it('a late refresh snapshot cannot revert the newer profile or persist the old refresh token', async () => {
  const refresh = deferred<Response>();
  let fresh = false;
  const h = await setup(async (url) => {
    if (url.endsWith('/login')) return ok(session());
    if (url.endsWith('/refresh')) {
      fresh = true;
      return refresh.promise;
    }
    if (url.endsWith('/me/profile')) return ok(profile('New'));
    if (!fresh) return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    return ok(profile('New'));
  });
  const reading = h.manager.request(
    '/test',
    (await import('@travel-budget/contracts')).accountProfileSchema
  );
  await vi.waitFor(() => expect(fresh).toBe(true));
  await h.editor.read();
  refresh.resolve(ok(session(user, 'rotated')));
  await reading;
  expect(h.manager.getSnapshot().user?.displayName).toBe('New');
  expect(h.credential()).toMatchObject({ token: 'rotated', user: { displayName: 'New' } });
});
it('429 preserves the input and Retry-After, preventing repeated sends', async () => {
  const h = await setup(async (url, init) => {
    if (url.endsWith('/login')) return ok(session());
    if (init?.method === 'PATCH')
      return Response.json(
        { error: { code: 'RATE_LIMITED' } },
        { status: 429, headers: { 'Retry-After': '120' } }
      );
    return ok(profile());
  });
  await h.editor.read();
  h.editor.edit('New');
  await h.editor.save();
  await h.editor.save();
  expect(h.editor.getSnapshot()).toMatchObject({
    name: 'New',
    uncertain: false,
    error: { retryAfter: 120 },
  });
  expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
});
it('serializes a profile update during refresh persistence using the newly rotated credential', async () => {
  const writing = deferred<void>();
  const entered = deferred<void>();
  let saved = encodeCredential('initial', user);
  let block = false;
  const store: CredentialStore = {
    get: async () => decodeCredential(saved).token,
    set: async (token, identity) => {
      if (block && token === 'rotated') {
        block = false;
        entered.resolve();
        await writing.promise;
      }
      saved = encodeCredential(token, identity);
    },
    clear: async () => {},
  };
  let rotated = false;
  const api = new ApiClient('https://example.invalid/api/v1', async (url) => {
    if (url.endsWith('/login')) return ok(session());
    if (url.endsWith('/refresh')) {
      rotated = true;
      return ok(session(user, 'rotated'));
    }
    return rotated
      ? ok(profile())
      : Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  });
  const manager = new SessionManager(api, store, async () => {});
  await manager.login('alice', 'password');
  block = true;
  const reading = manager.request(
    '/test',
    (await import('@travel-budget/contracts')).accountProfileSchema
  );
  await entered.promise;
  const updated = manager.updateUser({ ...user, displayName: 'New' }, manager.getSignInVersion());
  writing.resolve();
  await Promise.all([reading, updated]);
  expect(decodeCredential(saved)).toMatchObject({ token: 'rotated', user: { displayName: 'New' } });
  expect(manager.getSnapshot().user?.displayName).toBe('New');
});
it('keeps a failed initial read explicit and retries without displaying a fake profile', async () => {
  let failure = true;
  const h = await setup(async (url) => {
    if (url.endsWith('/login')) return ok(session());
    return failure
      ? Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
      : ok(profile());
  });
  await h.editor.read();
  expect(h.editor.getSnapshot().profile).toBeUndefined();
  expect(h.editor.getSnapshot().error).toMatchObject({ status: 500 });
  failure = false;
  await h.editor.read();
  expect(h.editor.getSnapshot().profile?.email).toBe('private@example.invalid');
});

it('refreshes untouched input after a remote rename, but preserves genuinely unsaved input', async () => {
  let current = profile();
  const h = await setup(async (url) => (url.endsWith('/login') ? ok(session()) : ok(current)));
  await h.editor.read();
  current = profile('Remote');
  await h.editor.read();
  expect(h.editor.getSnapshot().name).toBe('Remote');
  h.editor.edit('My input');
  current = profile('Another remote');
  await h.editor.read();
  expect(h.editor.getSnapshot()).toMatchObject({
    name: 'My input',
    profile: { displayName: 'Another remote' },
  });
});
it('local retry preserves a newer session identity instead of restoring an old profile snapshot', async () => {
  const h = await setup();
  await h.editor.read();
  h.editor.edit('New');
  h.fail(true);
  await h.editor.save();
  h.fail(false);
  await h.manager.updateUser({ ...user, displayName: 'Newer' }, h.manager.getSignInVersion());
  await h.editor.retryLocal();
  expect(h.manager.getSnapshot().user?.displayName).toBe('Newer');
  expect(h.credential().user?.displayName).toBe('Newer');
});
