import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { MAX_AVATAR_UPLOAD_BYTES } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import type { CropRect } from './avatarCrop';
const directory = () => new Directory(Paths.document, 'avatar-uploads');
function localFile(name: string) {
  if (!/^[a-f0-9-]{36}$/.test(name)) throw new ApiError('INVALID_RESPONSE');
  return new File(directory(), name);
}
export interface SelectedAvatar {
  file: string;
  contentType: 'image/jpeg';
  size: number;
}
export interface AvatarSource extends SelectedAvatar {
  width: number;
  height: number;
}
export const avatarFileUri = (name: string) => localFile(name).uri;
export async function removeAvatarFile(name: string) {
  const file = localFile(name);
  if (file.exists) file.delete();
}
export async function cleanupAvatarFiles(referenced: string[]) {
  const dir = directory();
  if (!dir.exists) return;
  for (const file of dir.list())
    if (
      file instanceof File &&
      !referenced.includes(file.name) &&
      (file.modificationTime ?? Date.now()) < Date.now() - 86_400_000
    )
      file.delete();
}
export async function pickAvatar(): Promise<AvatarSource | null> {
  const temporary: string[] = [];
  try {
    // Native system photo picker grants access only to selected images; no broad library permission.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      exif: false,
      quality: 1,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    temporary.push(asset.uri);
    const context = ImageManipulator.manipulate(asset.uri);
    try {
      if (Math.max(asset.width, asset.height) > 2048)
        context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
      const image = await context.renderAsync();
      try {
        if (
          !Number.isInteger(image.width) ||
          !Number.isInteger(image.height) ||
          image.width <= 0 ||
          image.height <= 0
        )
          throw new ApiError('AVATAR_PICK_FAILED');
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
        temporary.push(saved.uri);
        const source = new File(saved.uri),
          size = source.size;
        if (!Number.isInteger(size) || size <= 0 || size > MAX_AVATAR_UPLOAD_BYTES)
          throw new ApiError('AVATAR_FILE_SIZE');
        directory().create({ idempotent: true, intermediates: true });
        const file = randomUUID();
        source.copy(localFile(file));
        return { file, size, contentType: 'image/jpeg', width: image.width, height: image.height };
      } finally {
        image.release();
      }
    } finally {
      context.release();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('AVATAR_PICK_FAILED');
  } finally {
    for (const uri of new Set(temporary))
      if (uri.startsWith(Paths.cache.uri)) {
        try {
          const f = new File(uri);
          if (f.exists) f.delete();
        } catch {
          /* OS cache eviction. */
        }
      }
  }
}
export async function cropAvatar(source: AvatarSource, rect: CropRect): Promise<SelectedAvatar> {
  if (
    ![rect.originX, rect.originY, rect.width, rect.height].every(Number.isInteger) ||
    rect.originX < 0 ||
    rect.originY < 0 ||
    rect.width <= 0 ||
    rect.width !== rect.height ||
    rect.originX + rect.width > source.width ||
    rect.originY + rect.height > source.height
  )
    throw new ApiError('AVATAR_PICK_FAILED');
  const file = localFile(source.file);
  if (!file.exists) throw new ApiError('AVATAR_FILE_MISSING');
  const context = ImageManipulator.manipulate(file.uri);
  let temporary: string | undefined;
  try {
    context.crop(rect);
    if (rect.width > 512) context.resize({ width: 512 });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      temporary = saved.uri;
      const cropped = new File(saved.uri),
        size = cropped.size;
      if (!Number.isInteger(size) || size <= 0 || size > MAX_AVATAR_UPLOAD_BYTES)
        throw new ApiError('AVATAR_FILE_SIZE');
      directory().create({ idempotent: true, intermediates: true });
      const name = randomUUID();
      cropped.copy(localFile(name));
      return { file: name, size, contentType: 'image/jpeg' };
    } finally {
      image.release();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('AVATAR_PICK_FAILED');
  } finally {
    context.release();
    if (temporary?.startsWith(Paths.cache.uri)) {
      try {
        const cached = new File(temporary);
        if (cached.exists) cached.delete();
      } catch {
        /* OS cache eviction. */
      }
    }
  }
}
export async function uploadAvatarFile(
  name: string,
  ticket: { url: string; contentType: string },
  check: () => void
) {
  const file = localFile(name);
  if (!file.exists) throw new ApiError('AVATAR_FILE_MISSING');
  check();
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 120_000);
  const guardTimer = setInterval(() => {
    try {
      check();
    } catch {
      controller.abort();
    }
  }, 250);
  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') controller.abort();
  });
  try {
    const result = await file.upload(ticket.url, {
      httpMethod: 'PUT',
      sessionType: 'foreground',
      signal: controller.signal,
      headers: { 'Content-Type': ticket.contentType, 'If-None-Match': '*' },
    });
    if (!(result.status >= 200 && result.status < 300) && result.status !== 412)
      throw new ApiError('UPLOAD_INCOMPLETE');
  } finally {
    clearTimeout(timer);
    clearInterval(guardTimer);
    sub.remove();
  }
}
