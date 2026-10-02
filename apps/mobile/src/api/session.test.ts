import type { Fetcher } from './client';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient } from './client';
import { SessionManager, type CredentialStore } from './session';
const user = { id: '507f191e810c19729de860ea', username: 'traveler', displayName: 'Traveler' };
const otherUser = { id: '507f191e810c19729de860eb', username: 'other', displayName: 'Other' };
const session = (n: number, account = user) => ({
  user: account,
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  expiresIn: 900,
});
const ok = (data: unknown) => Response.json({ data });
const unauthorized = () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
const schema = z.object({ name: z.string() });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function nativeSignal(controller: AbortController): AbortSignal {
  return {
    get aborted() {
      return controller.signal.aborted;
    },
    addEventListener: controller.signal.addEventListener.bind(controller.signal),
    removeEventListener: controller.signal.removeEventListener.bind(controller.signal),
  } as AbortSignal;
}
function setup(
  handler: (path: string, init?: RequestInit) => Promise<Response>,
  clearPrivateData = async () => {}
) {
  let token: string | null = null;
  const store: CredentialStore = {
    get: vi.fn(async () => token),
    set: vi.fn(async (value: string) => {
      token = value;
    }),
    clear: vi.fn(async () => {
      token = null;
    }),
  };
  const clear = vi.fn(clearPrivateData);
  const fetcher = vi.fn<Fetcher>().mockImplementation((url, init) => handler(String(url), init));
  const manager = new SessionManager(new ApiClient('https://example.com', fetcher), store, clear);
  return { manager, store, clear, fetcher };
}
describe('session lifecycle', () => {
  it('coalesces simultaneous native queries into one rotation and retries each only once', async () => {
    let refreshes = 0;
    const { manager } = setup(async (url, init) => {
      if (url.endsWith('/login')) return ok(session(1));
      if (url.endsWith('/refresh')) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return ok(session(2));
      }
      return (init?.headers as Record<string, string>).Authorization === 'Bearer access-2'
        ? ok({ name: 'Tokyo' })
        : unauthorized();
    });
    await manager.login('traveler', 'password');
    expect(
      await Promise.all(
        [nativeSignal(new AbortController()), nativeSignal(new AbortController())].map((signal) =>
          manager.request('/trip', schema, { signal })
        )
      )
    ).toEqual([{ name: 'Tokyo' }, { name: 'Tokyo' }]);
    expect(refreshes).toBe(1);
    expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user });
    expect(JSON.stringify(manager.getSnapshot())).not.toContain('access-');
  });
  it('restores the saved credential on a fresh app instance', async () => {
    const { store, manager } = setup(async () => ok(session(1)));
    await manager.login('traveler', 'password');
    const restored = new SessionManager(
      new ApiClient('https://example.com', vi.fn<Fetcher>().mockResolvedValue(ok(session(2)))),
      store,
      async () => {}
    );
    await restored.restore();
    expect(restored.getSnapshot().user).toEqual(user);
    expect(await store.get()).toBe('refresh-2');
  });
  it('keeps the saved credential after an offline restore and allows retry', async () => {
    const { store, manager, fetcher } = setup(async () => {
      throw new TypeError('offline');
    });
    await store.set('refresh-1');
    await manager.restore();
    expect(manager.getSnapshot().status).toBe('error');
    expect(await store.get()).toBe('refresh-1');
    fetcher.mockResolvedValueOnce(ok(session(2)));
    await manager.restore();
    expect(manager.getSnapshot().status).toBe('signedIn');
  });
  it('clears credentials and private data when refresh is revoked', async () => {
    const { store, manager, clear } = setup(async () => unauthorized());
    await store.set('revoked');
    await manager.restore();
    expect(manager.getSnapshot().status).toBe('signedOut');
    expect(await store.get()).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
  });
  it('does not refresh on forbidden responses', async () => {
    const { manager, fetcher } = setup(async (url) =>
      url.endsWith('/login')
        ? ok(session(1))
        : Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })
    );
    await manager.login('traveler', 'password');
    await expect(manager.request('/trip', schema)).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects late data from the previous account after logout', async () => {
    let complete!: (response: Response) => void;
    const { manager, store, clear } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(1));
      if (url.endsWith('/logout')) return ok({ loggedOut: true });
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    await manager.login('traveler', 'password');
    const request = manager.request('/trip', schema);
    await manager.logout();
    complete(ok({ name: 'Private trip' }));
    await expect(request).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(await store.get()).toBeNull();
    expect(manager.getSnapshot().user).toBeNull();
    expect(clear).toHaveBeenCalledTimes(2);
  });
  it('stops after one retry if the new access token is still rejected', async () => {
    const { manager, fetcher } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(1));
      if (url.endsWith('/refresh')) return ok(session(2));
      return unauthorized();
    });
    await manager.login('traveler', 'password');
    await expect(manager.request('/trip', schema)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(manager.getSnapshot().status).toBe('signedOut');
  });
  it('retains the session when logout cannot reach the server', async () => {
    const { manager, store } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(1));
      throw new TypeError('offline');
    });
    await manager.login('traveler', 'password');
    await expect(manager.logout()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(await store.get()).toBe('refresh-1');
    expect(manager.getSnapshot().status).toBe('signedIn');
  });
});

describe('interrupted authentication', () => {
  it('coalesces startup restores, including failed refreshes, without losing the saved credential', async () => {
    const { manager, store, fetcher } = setup(async () => {
      throw new TypeError('offline');
    });
    await store.set('refresh-1');
    await Promise.all([manager.restore(), manager.restore()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await store.get()).toBe('refresh-1');
  });
  it.each(['Node', 'React Native'])(
    'does not replay a %s query cancelled while its shared refresh is in flight',
    async (runtime) => {
      let finish!: (response: Response) => void;
      let started!: () => void;
      const refreshing = new Promise<void>((resolve) => {
        started = resolve;
      });
      const { manager, fetcher } = setup(async (url) => {
        if (url.endsWith('/login')) return ok(session(1));
        if (url.endsWith('/refresh')) {
          started();
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
        return unauthorized();
      });
      await manager.login('traveler', 'password');
      const controller = new AbortController();
      const result = manager.request('/trip', schema, {
        signal: runtime === 'React Native' ? nativeSignal(controller) : controller.signal,
      });
      await refreshing;
      controller.abort();
      finish(ok(session(2)));
      await expect(result).rejects.toMatchObject(
        runtime === 'React Native' ? { code: 'CANCELLED' } : { name: 'AbortError' }
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(manager.getSnapshot().status).toBe('signedIn');
    }
  );
  it('does not expose a session when SecureStore cannot save its credential', async () => {
    const { manager, store, fetcher } = setup(async (url) =>
      url.endsWith('/login') ? ok(session(1)) : ok({ loggedOut: true })
    );
    vi.mocked(store.set).mockRejectedValueOnce(new Error('locked'));
    await expect(manager.login('traveler', 'password')).rejects.toMatchObject({ code: 'STORAGE' });
    expect(manager.getSnapshot().user).toBeNull();
    expect(String(fetcher.mock.calls[1][0])).toContain('/auth/logout');
  });
  it.each(['query', 'restore'])(
    'clears an unusable session when a %s rotation cannot be saved',
    async (source) => {
      const { manager, store, clear, fetcher } = setup(async (url) => {
        if (url.endsWith('/login')) return ok(session(1));
        if (url.endsWith('/refresh')) return ok(session(2));
        if (url.endsWith('/logout')) return ok({ loggedOut: true });
        return unauthorized();
      });
      if (source === 'query') await manager.login('traveler', 'password');
      else await store.set('refresh-1');
      clear.mockClear();
      vi.mocked(store.set).mockRejectedValueOnce(new Error('locked'));
      if (source === 'query') {
        await expect(manager.request('/trip', schema)).rejects.toMatchObject({ code: 'STORAGE' });
      } else {
        await manager.restore();
      }
      expect(manager.getSnapshot()).toMatchObject({
        status: 'signedOut',
        user: null,
        error: { code: 'STORAGE' },
      });
      expect(await store.get()).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
      const logout = fetcher.mock.calls.find(([url]) => url.endsWith('/logout'));
      expect(JSON.parse(logout?.[1]?.body as string)).toEqual({ refreshToken: 'refresh-2' });
      await expect(manager.request('/trip', schema)).rejects.toMatchObject({ status: 401 });
    }
  );
  it('does not let an old restore failure replace a newly signed-in account', async () => {
    const revoking = deferred<void>();
    const revoked = deferred<Response>();
    const { manager, store } = setup(async (url) => {
      if (url.endsWith('/refresh')) return ok(session(2));
      if (url.endsWith('/logout')) {
        revoking.resolve();
        return revoked.promise;
      }
      return ok(session(3, otherUser));
    });
    await store.set('refresh-1');
    vi.mocked(store.set).mockRejectedValueOnce(new Error('locked'));
    const restoring = manager.restore();
    await revoking.promise;
    await manager.login('other', 'password');
    revoked.resolve(ok({ loggedOut: true }));
    await restoring;
    expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user: otherUser });
    expect(await store.get()).toBe('refresh-3');
  });
  it('coalesces repeated logout taps into a single revocation and cleanup', async () => {
    const { manager, clear, fetcher } = setup(async (url) =>
      url.endsWith('/login') ? ok(session(1)) : ok({ loggedOut: true })
    );
    await manager.login('traveler', 'password');
    clear.mockClear();
    await Promise.all([manager.logout(), manager.logout()]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/logout'))).toHaveLength(1);
    expect(clear).toHaveBeenCalledOnce();
    expect(manager.getSnapshot().status).toBe('signedOut');
  });
  it('does not let a late logout erase a newer login', async () => {
    const revoking = deferred<void>();
    const revoked = deferred<Response>();
    let logins = 0;
    const { manager, store } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(++logins, logins === 1 ? user : otherUser));
      revoking.resolve();
      return revoked.promise;
    });
    await manager.login('traveler', 'password');
    const logout = manager.logout();
    await revoking.promise;
    await manager.login('other', 'password');
    revoked.resolve(ok({ loggedOut: true }));
    await logout;
    expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user: otherUser });
    expect(await store.get()).toBe('refresh-2');
  });
  it('allows a new account to refresh while the previous session cleanup is pending', async () => {
    const revoking = deferred<void>();
    const revoked = deferred<Response>();
    let refreshes = 0;
    const { manager, store } = setup(async (url, init) => {
      if (url.endsWith('/login')) return ok(session(3, otherUser));
      if (url.endsWith('/refresh'))
        return ok(++refreshes === 1 ? session(2) : session(4, otherUser));
      if (url.endsWith('/logout')) {
        revoking.resolve();
        return revoked.promise;
      }
      return (init?.headers as Record<string, string>).Authorization === 'Bearer access-4'
        ? ok({ name: 'New trip' })
        : unauthorized();
    });
    await store.set('refresh-1');
    vi.mocked(store.set).mockRejectedValueOnce(new Error('locked'));
    const restoring = manager.restore();
    await revoking.promise;
    await manager.login('other', 'password');
    try {
      await expect(manager.request('/trip', schema)).resolves.toEqual({ name: 'New trip' });
    } finally {
      revoked.resolve(ok({ loggedOut: true }));
      await restoring;
    }
    expect(refreshes).toBe(2);
    expect(await store.get()).toBe('refresh-4');
    expect(manager.getSnapshot().status).toBe('signedIn');
  });
});

describe('private query cache lifecycle', () => {
  it.each(['logout', 'revoked', 'storage'])(
    'removes cached trips and cancels pending reads on %s',
    async (cause) => {
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const pendingRead = deferred<Response>();
      const readStarted = deferred<void>();
      const { manager, store } = setup(
        async (url) => {
          if (url.endsWith('/login')) return ok(session(1));
          if (url.endsWith('/logout')) return ok({ loggedOut: true });
          if (url.endsWith('/refresh'))
            return cause === 'storage' ? ok(session(2)) : unauthorized();
          if (url.endsWith('/slow-trip')) {
            readStarted.resolve();
            return pendingRead.promise;
          }
          return unauthorized();
        },
        async () => {
          await cache.cancelQueries();
          cache.clear();
        }
      );
      try {
        await manager.login('traveler', 'password');
        cache.setQueryData([manager.api.baseUrl, user.id, 'trips'], [{ name: 'Private trip' }]);
        const loading = cache
          .fetchQuery({
            queryKey: [manager.api.baseUrl, user.id, 'trip', 'slow'],
            queryFn: ({ signal }) => manager.request('/slow-trip', schema, { signal }),
          })
          .catch(() => {});
        await readStarted.promise;
        if (cause === 'logout') await manager.logout();
        else {
          if (cause === 'storage') vi.mocked(store.set).mockRejectedValueOnce(new Error('locked'));
          await expect(manager.request('/trip', schema)).rejects.toMatchObject(
            cause === 'storage' ? { code: 'STORAGE' } : { status: 401 }
          );
        }
        pendingRead.resolve(ok({ name: 'Late private trip' }));
        await loading;
        expect(cache.getQueryCache().getAll()).toHaveLength(0);
        expect(manager.getSnapshot().status).toBe('signedOut');
        expect(await store.get()).toBeNull();
      } finally {
        pendingRead.resolve(ok({ name: 'Late private trip' }));
        cache.clear();
      }
    }
  );
});
