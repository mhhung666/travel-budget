import { expect, it, vi } from 'vitest';
import { decodeCredential, encodeCredential } from './sessionCredential';
import { ApiClient, validateBaseUrl } from '@/api/client';
import { SessionManager } from '@/api/session';
import { createCredentialStore } from './credentials';

const native = vi.hoisted(() => ({ data: new Map<string, string>(), fail: false }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algorithm: unknown, value: string) => value.replace(/\W/g, '_'),
}));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'private',
  getItemAsync: async (key: string) => native.data.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (native.fail) throw new Error('locked');
    native.data.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    native.data.delete(key);
  },
}));
const user = { id: '507f191e810c19729de860ea', username: 'ann', displayName: 'Ann' };
it('supports legacy credentials online but cannot infer an offline identity from their tokens', () => {
  expect(decodeCredential('opaque-refresh')).toEqual({ token: 'opaque-refresh', user: null });
  expect(decodeCredential(null)).toEqual({ token: null, user: null });
  expect(decodeCredential(encodeCredential('refresh', user))).toEqual({ token: 'refresh', user });
  expect(() => decodeCredential('{"version": 9}')).toThrow();
});
it('atomically saves credential and identity, isolates environments, and clears both on logout', async () => {
  const a = createCredentialStore('https://a.test');
  const b = createCredentialStore('https://b.test');
  await a.set('ann-refresh', user);
  expect(await a.getLocalUser!()).toEqual(user);
  expect(await b.getLocalUser!()).toBeNull();
  native.fail = true;
  await expect(
    a.set('bob-refresh', { ...user, id: '507f191e810c19729de860eb' })
  ).rejects.toMatchObject({ code: 'STORAGE' });
  native.fail = false;
  expect(await a.get()).toBe('ann-refresh');
  expect(await a.getLocalUser!()).toEqual(user);
  await a.clear();
  expect(await a.get()).toBeNull();
  expect(await a.getLocalUser!()).toBeNull();
});

it.each([
  null,
  undefined,
  {},
  { id: user.id },
  { ...user, id: 'invalid' },
  { ...user, displayName: 1 },
])('keeps the refresh token when saved local identity is incompatible: %j', (savedUser) => {
  expect(
    decodeCredential(JSON.stringify({ version: 1, token: 'refresh', user: savedUser }))
  ).toEqual({ token: 'refresh', user: null });
});
it.each([
  '{',
  '{"version":2,"token":"refresh"}',
  '{"version":1,"token":""}',
  '{"version":1,"token":7}',
])('still rejects malformed credential envelopes: %s', (value) =>
  expect(() => decodeCredential(value)).toThrow()
);
it.each(['online', 'offline'] as const)(
  'restores %s without a storage error when only saved identity is incompatible',
  async (mode) => {
    const environment = `https://identity-${mode}.test`;
    const store = createCredentialStore(environment);
    // Model an old saved user missing a field now required by the current runtime schema.
    native.data.set(
      `travel-budget.session.${environment.replace(/\W/g, '_')}`,
      JSON.stringify({
        version: 1,
        token: 'refresh',
        user: { id: user.id, username: user.username },
      })
    );
    expect(await store.get()).toBe('refresh');
    expect(await store.getLocalUser!()).toBeNull();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh' });
      if (mode === 'offline') throw new TypeError('offline');
      return Response.json({
        data: { user, accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 900 },
      });
    });
    const manager = new SessionManager(new ApiClient(environment, fetcher), store, async () => {});
    await manager.restore();
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (mode === 'online') {
      expect(manager.getSnapshot()).toMatchObject({ status: 'signedIn', user });
      expect(await store.get()).toBe('refresh-new');
      expect(await store.getLocalUser!()).toEqual(user);
    } else {
      expect(manager.getSnapshot()).toMatchObject({
        status: 'error',
        user: null,
        error: { code: 'NETWORK' },
      });
      expect(await store.get()).toBe('refresh');
      expect(await store.getLocalUser!()).toBeNull();
    }
  }
);

it('keeps one SecureStore credential when the configured address moves from v1 to v2', async () => {
  const v1 = new ApiClient(validateBaseUrl('https://switch.test/api/v1', false));
  await createCredentialStore(v1.environment).set('refresh-v1-era', user);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe('https://switch.test/api/v2/auth/refresh');
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-v1-era' });
    return Response.json({
      data: { user, accessToken: 'access-new', refreshToken: 'refresh-new', expiresIn: 900 },
    });
  });
  const v2 = new ApiClient(validateBaseUrl('https://switch.test/api/v2', false), fetcher);
  expect(v2.environment).toBe(v1.environment);
  const store = createCredentialStore(v2.environment);
  const manager = new SessionManager(v2, store, async () => {});
  await manager.restore();
  expect(manager.getSnapshot()).toMatchObject({ status: 'signedIn', user });
  expect(fetcher).toHaveBeenCalledOnce();
  // The rotated token replaced the original entry instead of starting a second one.
  expect(await createCredentialStore(v1.environment).get()).toBe('refresh-new');
  expect([...native.data.keys()].filter((key) => key.includes('switch'))).toHaveLength(1);
});
