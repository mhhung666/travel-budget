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
        cache.setQueryData([manager.api.environment, user.id, 'trips'], [{ name: 'Private trip' }]);
        const loading = cache
          .fetchQuery({
            queryKey: [manager.api.environment, user.id, 'trip', 'slow'],
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

describe('requests bound to one account', () => {
  const sentBodies = (fetcher: ReturnType<typeof setup>['fetcher'], suffix: string) =>
    fetcher.mock.calls
      .filter(([url]) => url.endsWith(suffix))
      .map(([, init]) => String(init?.body));

  it('runs for the signed-in account', async () => {
    const { manager } = setup(async (url) =>
      url.endsWith('/login') ? ok(session(1)) : ok({ name: 'Tokyo' })
    );
    await manager.login('traveler', 'password');
    await expect(manager.requestAs(user.id, '/trip', schema)).resolves.toEqual({ name: 'Tokyo' });
  });

  it('sends nothing when no one is signed in', async () => {
    const { manager, fetcher } = setup(async () => ok({ name: 'x' }));
    await expect(manager.requestAs(user.id, '/trip', schema)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never sends one account’s request with another account’s token', async () => {
    let logins = 0;
    const { manager, fetcher } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(++logins, logins === 1 ? user : otherUser));
      if (url.endsWith('/logout')) return ok({ loggedOut: true });
      return ok({ name: 'created' });
    });
    await manager.login('traveler', 'password');
    await manager.logout();
    await manager.login('other', 'password');
    fetcher.mockClear();
    await expect(
      manager.requestAs(user.id, '/trips/1/expenses', schema, { method: 'POST', body: { a: 1 } })
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(manager.requestAs(otherUser.id, '/trip', schema)).resolves.toEqual({
      name: 'created',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a 401 and resends the write with the same body', async () => {
    const body = { client_request_id: '8d2b0f0e-6a63-4f6f-a0f5-0b7a4d2c9e11', amount: 100 };
    const { manager, fetcher } = setup(async (url, init) => {
      if (url.endsWith('/login')) return ok(session(1));
      if (url.endsWith('/refresh')) return ok(session(2));
      return (init?.headers as Record<string, string>).Authorization === 'Bearer access-2'
        ? ok({ name: 'created' })
        : unauthorized();
    });
    await manager.login('traveler', 'password');
    await expect(
      manager.requestAs(user.id, '/trips/1/expenses', schema, { method: 'POST', body })
    ).resolves.toEqual({ name: 'created' });
    const bodies = sentBodies(fetcher, '/trips/1/expenses');
    expect(bodies).toEqual([JSON.stringify(body), JSON.stringify(body)]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  });

  it('does not answer a write that is still in flight after the account changed', async () => {
    let finish!: (response: Response) => void;
    let logins = 0;
    const { manager } = setup(async (url) => {
      if (url.endsWith('/login')) return ok(session(++logins, logins === 1 ? user : otherUser));
      if (url.endsWith('/logout')) return ok({ loggedOut: true });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await manager.login('traveler', 'password');
    const write = manager.requestAs(user.id, '/trips/1/expenses', schema, {
      method: 'POST',
      body: { a: 1 },
    });
    await manager.logout();
    await manager.login('other', 'password');
    finish(ok({ name: 'created' }));
    // The server may have written it; the caller must treat the outcome as unknown.
    await expect(write).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('does not answer a write that was resent and succeeds after the account changed', async () => {
    let finish: ((response: Response) => void) | undefined;
    let logins = 0;
    const accounts = [user, otherUser];
    const { manager } = setup(async (url, init) => {
      if (url.endsWith('/login')) return ok(session(logins ? 3 : 1, accounts[logins++]));
      if (url.endsWith('/refresh')) return ok(session(2));
      if (url.endsWith('/logout')) return ok({ loggedOut: true });
      if ((init?.headers as Record<string, string>).Authorization === 'Bearer access-1')
        return unauthorized();
      return new Promise((respond) => {
        finish = respond;
      });
    });
    await manager.login('traveler', 'password');
    const write = manager.requestAs(user.id, '/trips/1/expenses', schema, {
      method: 'POST',
      body: { a: 1 },
    });
    // The first attempt was refused, the session refreshed and the write sent again.
    await vi.waitFor(() => expect(finish).toBeDefined());
    await manager.logout();
    await manager.login('other', 'password');
    finish!(ok({ name: 'created' }));
    await expect(write).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user: otherUser });
  });

  describe('an error that arrives after the account changed', () => {
    const answers: [string, () => Response | Error][] = [
      [
        '400 with the API’s error body',
        () => Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 }),
      ],
      ['404', () => Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })],
      ['500', () => Response.json({ error: { code: 'SERVER_ERROR' } }, { status: 500 })],
      ['401', unauthorized],
      ['unreadable answer', () => new Response('<html>', { status: 502 })],
      ['network failure', () => new TypeError('connection lost')],
    ];
    const accounts = [user, otherUser];

    it.each(answers)(
      'is never reported as the answer of the new sign-in: %s',
      async (_name, answer) => {
        let finish!: { respond(response: Response): void; fail(error: unknown): void };
        let logins = 0;
        const { manager } = setup(async (url) => {
          if (url.endsWith('/login')) return ok(session(logins + 1, accounts[logins++]));
          if (url.endsWith('/logout')) return ok({ loggedOut: true });
          return new Promise((respond, fail) => {
            finish = { respond, fail };
          });
        });
        await manager.login('traveler', 'password');
        const write = manager.requestAs(user.id, '/trips/1/expenses', schema, {
          method: 'POST',
          body: { a: 1 },
        });
        await manager.logout();
        await manager.login('other', 'password');
        const result = answer();
        if (result instanceof Error) finish.fail(result);
        else finish.respond(result);
        // A late 400 would otherwise read as proof that the write never happened.
        await expect(write).rejects.toMatchObject({ code: 'CANCELLED' });
        expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user: otherUser });
      }
    );

    it('is never reported as the answer of the new sign-in, also when the write was resent', async () => {
      let finish: ((response: Response) => void) | undefined;
      let logins = 0;
      const { manager } = setup(async (url, init) => {
        if (url.endsWith('/login')) return ok(session(logins ? 3 : 1, accounts[logins++]));
        if (url.endsWith('/refresh')) return ok(session(2));
        if (url.endsWith('/logout')) return ok({ loggedOut: true });
        if ((init?.headers as Record<string, string>).Authorization === 'Bearer access-1')
          return unauthorized();
        return new Promise((respond) => {
          finish = respond;
        });
      });
      await manager.login('traveler', 'password');
      const write = manager.requestAs(user.id, '/trips/1/expenses', schema, {
        method: 'POST',
        body: { a: 1 },
      });
      // The first attempt was refused, the session refreshed and the write sent again.
      await vi.waitFor(() => expect(finish).toBeDefined());
      await manager.logout();
      await manager.login('other', 'password');
      finish!(Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 }));
      await expect(write).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user: otherUser });
    });

    it('still reports errors of the current sign-in as they are', async () => {
      const { manager } = setup(async (url) =>
        url.endsWith('/login')
          ? ok(session(1))
          : Response.json({ error: { code: 'VALIDATION_ERROR' } }, { status: 400 })
      );
      await manager.login('traveler', 'password');
      await expect(
        manager.requestAs(user.id, '/trips/1/expenses', schema, { method: 'POST', body: { a: 1 } })
      ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });
  });
});

describe('refresh error provenance', () => {
  it.each([400, 401, 403, 404, 409, 413, 415, 429, 500])(
    'marks refresh %s as an authentication request error without replaying the write',
    async (status) => {
      const { manager, fetcher } = setup(async (url) => {
        if (url.endsWith('/login')) return ok(session(1));
        if (url.endsWith('/refresh'))
          return Response.json(
            { error: { code: 'REFRESH_REFUSED' } },
            { status, headers: { 'Retry-After': '10' } }
          );
        return unauthorized();
      });
      await manager.login('traveler', 'password');
      await expect(
        manager.requestAs(user.id, '/trips/1/expenses', schema, { method: 'POST', body: { a: 1 } })
      ).rejects.toMatchObject({
        source: 'refresh',
        status,
        code: 'REFRESH_REFUSED',
        retryAfter: 10,
      });
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/expenses'))).toHaveLength(1);
      if (status === 401) expect(manager.getSnapshot().status).toBe('signedOut');
    }
  );

  it.each([400, 401, 500, 'network'] as const)(
    'cancels an old refresh %s when even the same account signs in again',
    async (status) => {
      const entered = deferred<void>();
      const finish = deferred<Response>();
      let logins = 0;
      const { manager, store, fetcher } = setup(async (url) => {
        if (url.endsWith('/login')) return ok(session(++logins));
        if (url.endsWith('/refresh')) {
          entered.resolve();
          return finish.promise;
        }
        return unauthorized();
      });
      await manager.login('traveler', 'password');
      const write = manager.requestAs(user.id, '/trips/1/expenses', schema, {
        method: 'POST',
        body: { a: 1 },
      });
      await entered.promise;
      await manager.login('traveler', 'password');
      if (status === 'network') {
        // A body-read failure is a transport error too.
        const response = ok({});
        response.json = async () => {
          throw new TypeError('connection lost');
        };
        finish.resolve(response);
      } else finish.resolve(Response.json({ error: { code: 'REFRESH_REFUSED' } }, { status }));
      await expect(write).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user });
      expect(await store.get()).toBe('refresh-2');
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/expenses'))).toHaveLength(1);
    }
  );
});

describe('B5c-1 authentication transport', () => {
  it('refreshes a credential saved by the v1 release on v2 without asking to sign in again', async () => {
    let token: string | null = 'refresh-v1-era';
    const store: CredentialStore = {
      get: async () => token,
      set: async (value) => {
        token = value;
      },
      clear: async () => {
        token = null;
      },
    };
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = vi.fn<Fetcher>().mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: init?.body && JSON.parse(String(init.body)) });
      if (String(url).endsWith('/auth/logout')) return ok({ loggedOut: true });
      return ok(session(calls.length));
    });
    const manager = new SessionManager(
      new ApiClient('https://example.com/api/v1', fetcher),
      store,
      async () => {}
    );
    await manager.restore();
    expect(manager.getSnapshot()).toEqual({ status: 'signedIn', user });
    expect(token).toBe('refresh-1');
    await manager.logout();
    await manager.login('traveler', 'password');
    expect(calls).toEqual([
      {
        url: 'https://example.com/api/v2/auth/refresh',
        body: { refreshToken: 'refresh-v1-era' },
      },
      { url: 'https://example.com/api/v2/auth/logout', body: { refreshToken: 'refresh-1' } },
      {
        url: 'https://example.com/api/v2/auth/login',
        body: { username: 'traveler', password: 'password' },
      },
    ]);
  });
});
