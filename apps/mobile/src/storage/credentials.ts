import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { ApiError } from '@/api/client';
import { decodeCredential, encodeCredential } from './sessionCredential';
import type { CredentialStore } from '@/api/session';

export function createCredentialStore(environment: string): CredentialStore {
  const key = () =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, environment).then(
      (hash) => `travel-budget.session.${hash}`
    );
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const read = async () => {
    try {
      return decodeCredential(
        Platform.OS === 'web' ? null : await SecureStore.getItemAsync(await key(), options)
      );
    } catch {
      throw new ApiError('STORAGE');
    }
  };
  return {
    get: async () => (await read()).token,
    getLocalUser: async () => (await read()).user,
    async set(token, user) {
      if (Platform.OS === 'web') throw new ApiError('NATIVE_ONLY');
      try {
        await SecureStore.setItemAsync(await key(), encodeCredential(token, user), options);
      } catch {
        throw new ApiError('STORAGE');
      }
    },
    async clear() {
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(await key(), options);
    },
  };
}
