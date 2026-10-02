import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { ApiError } from '@/api/client';
import type { CredentialStore } from '@/api/session';

export function createCredentialStore(environment: string): CredentialStore {
  const key = () =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, environment).then(
      (hash) => `travel-budget.session.${hash}`
    );
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  return {
    async get() {
      try {
        return Platform.OS === 'web' ? null : await SecureStore.getItemAsync(await key(), options);
      } catch {
        throw new ApiError('STORAGE');
      }
    },
    async set(token) {
      if (Platform.OS === 'web') throw new ApiError('NATIVE_ONLY');
      try {
        await SecureStore.setItemAsync(await key(), token, options);
      } catch {
        throw new ApiError('STORAGE');
      }
    },
    async clear() {
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(await key(), options);
    },
  };
}
