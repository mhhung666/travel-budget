import type { AvatarWriteStore } from './avatarWrites';
/** Web preview does not provide native avatar confirmation storage. */
export function openAvatarWriteStore(): Promise<AvatarWriteStore> {
  return Promise.reject(new Error('NATIVE_REQUIRED'));
}
