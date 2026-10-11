import { expect, it, vi } from 'vitest';
import { ApiClient } from '@/api/client';
import { SessionManager } from '@/api/session';
import { PasswordChanger } from './PasswordChanger';
const alice = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const bob = { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob' };
const ok = (data: unknown) => Response.json({ data });
async function setup(
  response: () => Promise<Response> = async () => ok({ changed: true, reauthenticate: true })
) {
  const clear = vi.fn(),
    cache = vi.fn(),
    set = vi.fn();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/login'))
      return ok({
        user: JSON.parse(String(init?.body)).username === 'bob' ? bob : alice,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
    return response();
  });
  const manager = new SessionManager(
    new ApiClient('https://example.invalid/api/v2', fetcher),
    { get: async () => null, set, clear },
    cache
  );
  await manager.login('alice', 'password');
  let online = true;
  const changer = new PasswordChanger(manager, () => online);
  const edit = () => {
    changer.edit('current', ' old password ');
    changer.edit('password', ' new password ');
    changer.edit('confirmation', ' new password ');
  };
  return {
    changer,
    manager,
    clear,
    cache,
    set,
    fetcher,
    edit,
    offline: () => {
      online = false;
    },
  };
}
it('submits explicitly once, preserves password spaces, clears credentials/cache and leaves durable work alone', async () => {
  const h = await setup();
  h.edit();
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(await Promise.all([h.changer.submit(), h.changer.submit()])).toEqual([true, false]);
  const writes = h.fetcher.mock.calls.filter(([url]) => url.endsWith('/me/password'));
  expect(writes).toHaveLength(1);
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
    current_password: ' old password ',
    new_password: ' new password ',
  });
  expect(h.clear).toHaveBeenCalledOnce();
  expect(h.manager.getSnapshot().status).toBe('signedOut');
  expect(h.changer.getSnapshot()).toMatchObject({
    current: '',
    password: '',
    confirmation: '',
    busy: false,
  });
  expect(JSON.stringify(h.set.mock.calls)).not.toContain('new password');
});
it('validates UTF-8 bcrypt limit, mismatch and offline before any write; dispose erases input', async () => {
  const h = await setup();
  h.edit();
  h.changer.edit('password', '中'.repeat(25));
  h.changer.edit('confirmation', '中'.repeat(25));
  await h.changer.submit();
  expect(h.changer.getSnapshot().error).toMatchObject({ code: 'PASSWORD_INVALID' });
  h.edit();
  h.changer.edit('confirmation', 'different');
  await h.changer.submit();
  expect(h.changer.getSnapshot().error).toMatchObject({ code: 'PASSWORD_MISMATCH' });
  h.edit();
  h.offline();
  await h.changer.submit();
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(h.changer.getSnapshot().uncertain).toBe(false);
  h.edit();
  h.changer.dispose();
  expect(h.changer.getSnapshot().password).toBe('');
});
it.each(['INVALID_CURRENT_PASSWORD', 'RESOURCE_CHANGED', 'RATE_LIMITED'])(
  'a definite %s refusal permits correction without claiming success',
  async (code) => {
    const h = await setup(async () =>
      Response.json(
        { error: { code } },
        { status: code === 'RATE_LIMITED' ? 429 : 400, headers: { 'Retry-After': '120' } }
      )
    );
    h.edit();
    expect(await h.changer.submit()).toBe(false);
    expect(h.changer.getSnapshot()).toMatchObject({
      uncertain: false,
      password: '',
      error: { code },
    });
    expect(h.clear).not.toHaveBeenCalled();
  }
);
it.each(['network', '401', 'invalid', '500'])(
  'uncertain %s never refreshes/resends and requires explicit local sign-out',
  async (mode) => {
    const h = await setup(async () => {
      if (mode === 'network') throw new TypeError('lost response');
      if (mode === 'invalid') return ok({ changed: true });
      return Response.json(
        { error: { code: mode === '401' ? 'UNAUTHORIZED' : 'INTERNAL_ERROR' } },
        { status: Number(mode) }
      );
    });
    h.edit();
    await h.changer.submit();
    expect(h.changer.getSnapshot()).toMatchObject({ uncertain: true, password: '', current: '' });
    h.edit();
    await h.changer.submit();
    expect(h.fetcher).toHaveBeenCalledTimes(2);
    expect(h.clear).not.toHaveBeenCalled();
    expect(await h.changer.reauthenticate()).toBe(true);
    expect(h.clear).toHaveBeenCalledOnce();
  }
);
it('a late previous-account success never signs the newly logged-in account out', async () => {
  let finish!: (r: Response) => void;
  const h = await setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  h.edit();
  const submit = h.changer.submit();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await h.manager.login('bob', 'password');
  finish(ok({ changed: true, reauthenticate: true }));
  expect(await submit).toBe(false);
  expect(h.manager.getSnapshot().user?.id).toBe(bob.id);
  expect(h.clear).not.toHaveBeenCalled();
});

it.each(['credentials', 'cache'])(
  'successful change with %s cleanup failure erases secrets and exposes recovery instead of an endless spinner',
  async (failure) => {
    const h = await setup();
    if (failure === 'credentials') h.clear.mockRejectedValue(new Error('clear failed'));
    else h.cache.mockRejectedValue(new Error('cache failed'));
    h.edit();
    expect(await h.changer.submit()).toBe(false);
    expect(h.manager.getSnapshot()).toMatchObject({
      status: 'error',
      user: null,
      error: { code: 'STORAGE' },
    });
    expect(h.changer.getSnapshot()).toMatchObject({
      current: '',
      password: '',
      confirmation: '',
      busy: false,
    });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.fetcher.mock.calls.filter(([url]) => url.endsWith('/me/password'))).toHaveLength(1);
  }
);
