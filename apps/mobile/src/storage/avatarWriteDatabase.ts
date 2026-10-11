import * as SQLite from 'expo-sqlite';
import { createAvatarWriteStore, type AvatarWriteStore } from './avatarWrites';
let opening: Promise<AvatarWriteStore> | undefined;
export function openAvatarWriteStore() {
  opening ??= SQLite.openDatabaseAsync('travel-budget-avatar-writes.db')
    .then(createAvatarWriteStore)
    .catch((e: unknown) => {
      opening = undefined;
      throw e;
    });
  return opening;
}
