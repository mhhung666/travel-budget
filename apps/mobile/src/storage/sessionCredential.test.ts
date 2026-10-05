import { expect, it, vi } from 'vitest';
import { decodeCredential, encodeCredential } from './sessionCredential';
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
