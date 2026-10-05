import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient, ApiError, type Fetcher } from './client';
import { SessionManager, type CredentialStore } from './session';
import { decodeCredential, encodeCredential } from '@/storage/sessionCredential';

const user = { id: '507f191e810c19729de860ea', username: 'ann', displayName: 'Ann' };
const other = { ...user, id: '507f191e810c19729de860eb', username: 'bob' };
const session = (account = user) => ({
  user: account,
  accessToken: 'access',
  refreshToken: 'rotated',
  expiresIn: 900,
});
function setup() {
  let value: string | null = encodeCredential('refresh', user);
  const store: CredentialStore = {
    get: async () => decodeCredential(value).token,
    getLocalUser: async () => decodeCredential(value).user,
    set: async (token, account) => {
      value = encodeCredential(token, account);
    },
    clear: async () => {
      value = null;
    },
  };
  const fetcher = vi.fn<Fetcher>().mockRejectedValue(new TypeError('offline'));
  const cleared = vi.fn(async () => {});
  const manager = new SessionManager(new ApiClient('https://a.test', fetcher), store, cleared);
  return { manager, store, fetcher, cleared };
}
it('cold starts into local identity mode after offline restore without enabling any authenticated HTTP', async () => {
  const h = setup();
  await h.manager.restore();
  expect(h.manager.getSnapshot()).toMatchObject({
    status: 'local',
    user,
    error: { code: 'NETWORK' },
  });
  expect(JSON.stringify(h.manager.getSnapshot())).not.toContain('refreshToken');
  h.fetcher.mockClear();
  await expect(h.manager.requestAs(user.id, '/trips', z.unknown())).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
  expect(h.fetcher).not.toHaveBeenCalled();
  expect(await h.store.get()).toBe('refresh');
});
it('requires successful online rotation to leave local mode; a failed retry keeps identity', async () => {
  const h = setup();
  await h.manager.restore();
  await h.manager.restore();
  expect(h.manager.getSnapshot().status).toBe('local');
  h.fetcher.mockResolvedValue(Response.json({ data: session() }));
  await h.manager.restore();
  expect(h.manager.getSnapshot()).toEqual({ status: 'signedIn', user });
  expect(await h.store.getLocalUser!()).toEqual(user);
});
it.each([401, 403, 500])(
  'does not grant local access after a known server refusal (%i)',
  async (status) => {
    const h = setup();
    h.fetcher.mockResolvedValue(Response.json({ error: { code: 'REFUSED' } }, { status }));
    await h.manager.restore();
    expect(h.manager.getSnapshot().user).toBeNull();
    expect(h.manager.getSnapshot().status).toBe(status === 401 ? 'signedOut' : 'error');
    if (status === 401) {
      expect(await h.store.getLocalUser!()).toBeNull();
      expect(h.cleared).toHaveBeenCalledOnce();
    }
  }
);
it('never infers local identity for a legacy credential or unsafe storage read', async () => {
  const h = setup();
  await h.store.set('legacy');
  await h.manager.restore();
  expect(h.manager.getSnapshot().status).toBe('error');
  await h.store.set('refresh', user);
  h.store.getLocalUser = async () => {
    throw new ApiError('STORAGE');
  };
  await h.manager.restore();
  expect(h.manager.getSnapshot()).toMatchObject({
    status: 'error',
    user: null,
    error: { code: 'STORAGE' },
  });
});
it('never accepts a rotated session for a different saved account', async () => {
  const h = setup();
  h.fetcher.mockResolvedValue(Response.json({ data: session(other) }));
  await h.manager.restore();
  expect(h.manager.getSnapshot().status).toBe('signedOut');
  expect(await h.store.getLocalUser!()).toBeNull();
});
it('clears local identity during A→B→A switches and cannot restore a late A response over B', async () => {
  const h = setup();
  await h.manager.restore();
  let resolve!: (value: Response) => void;
  const delayed = new Promise<Response>((finish) => {
    resolve = finish;
  });
  h.fetcher.mockImplementationOnce(() => delayed);
  const restoring = h.manager.restore();
  // Wait for the restore to reach its network request, rather than racing storage queue reads.
  await vi.waitFor(() => expect(h.fetcher).toHaveBeenCalledTimes(2));
  h.fetcher.mockResolvedValue(Response.json({ data: session(other) }));
  const login = h.manager.login('bob', 'password');
  expect(h.manager.getSnapshot().user).toBeNull();
  await login;
  resolve(Response.json({ data: session(user) }));
  await restoring;
  expect(h.manager.getSnapshot()).toEqual({ status: 'signedIn', user: other });
  expect(await h.store.getLocalUser!()).toEqual(other);
  h.fetcher.mockResolvedValue(Response.json({ data: session(user) }));
  await h.manager.login('ann', 'password');
  expect(await h.store.getLocalUser!()).toEqual(user);
});
it('offline logout preserves local access and the credential until revocation succeeds', async () => {
  const h = setup();
  await h.manager.restore();
  await expect(h.manager.logout()).rejects.toMatchObject({ code: 'NETWORK' });
  expect(h.manager.getSnapshot().status).toBe('local');
  expect(await h.store.getLocalUser!()).toEqual(user);
  h.fetcher.mockResolvedValue(Response.json({ data: { loggedOut: true } }));
  await h.manager.logout();
  expect(h.manager.getSnapshot().status).toBe('signedOut');
  expect(await h.store.getLocalUser!()).toBeNull();
});
