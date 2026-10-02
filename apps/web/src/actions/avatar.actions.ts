'use server';

import { dbConnect } from '@/lib/mongodb';
import { User as UserModel } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { isAvatarKeyForUser, AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES } from '@/lib/uploads';
import { headObject, deleteObjects, avatarPublicUrl, avatarKeyFromUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

/**
 * Set the current user's avatar from an uploaded R2 object. The key must live
 * under this user's avatars/<userId>/ prefix and the object is verified via
 * HeadObject (size/type taken from the object, not client-declared). Stores the
 * public URL (avatars bucket is public-read) and best-effort deletes the
 * previous avatar object.
 */
export const setAvatar = withAuth(
  async (session, key: string): Promise<ActionResult<{ avatar_url: string }>> => {
    try {
      if (!isAvatarKeyForUser(session.userId, key)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const head = await headObject('avatars', key);
      if (
        !head ||
        head.size > MAX_AVATAR_BYTES ||
        !(AVATAR_CONTENT_TYPES as readonly string[]).includes(head.contentType)
      ) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();
      const prev = await UserModel.findById(session.userId)
        .select('avatarUrl')
        .lean<{ avatarUrl?: string | null } | null>();

      const avatarUrl = avatarPublicUrl(key);
      await UserModel.updateOne({ _id: session.userId }, { $set: { avatarUrl } });

      // best-effort：刪掉前一張頭像物件（避免孤兒）
      if (prev?.avatarUrl && prev.avatarUrl !== avatarUrl) {
        const oldKey = avatarKeyFromUrl(prev.avatarUrl);
        if (oldKey) {
          await deleteObjects('avatars', [oldKey]).catch((e) =>
            logger.error('setAvatar: old avatar cleanup failed', e)
          );
        }
      }

      return { success: true, data: { avatar_url: avatarUrl } };
    } catch (error) {
      logger.error('setAvatar error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** Clear the current user's avatar and best-effort delete the stored object. */
export const removeAvatar = withAuth(
  async (session): Promise<ActionResult<{ message: string }>> => {
    try {
      await dbConnect();
      const prev = await UserModel.findById(session.userId)
        .select('avatarUrl')
        .lean<{ avatarUrl?: string | null } | null>();

      await UserModel.updateOne({ _id: session.userId }, { $unset: { avatarUrl: '' } });

      if (prev?.avatarUrl) {
        const oldKey = avatarKeyFromUrl(prev.avatarUrl);
        if (oldKey) {
          await deleteObjects('avatars', [oldKey]).catch((e) =>
            logger.error('removeAvatar: cleanup failed', e)
          );
        }
      }

      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('removeAvatar error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
