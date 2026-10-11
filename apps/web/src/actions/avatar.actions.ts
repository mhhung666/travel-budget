'use server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { AvatarWriteError, setWebAvatar, removeWebAvatar } from '@/lib/avatarWrite';
import { logger } from '@/lib/logger';
export const setAvatar = withAuth(
  async (session, key: string): Promise<ActionResult<{ avatar_url: string }>> => {
    try {
      await dbConnect();
      const result = await setWebAvatar(mongoose.connection.db!, session.userId, key);
      return { success: true, data: { avatar_url: result.avatarUrl! } };
    } catch (error) {
      if (error instanceof AvatarWriteError)
        return {
          success: false,
          error: error.code,
          code:
            error.code === 'NOT_FOUND'
              ? 'NOT_FOUND'
              : error.code === 'VALIDATION_ERROR'
                ? 'VALIDATION_ERROR'
                : 'CONFLICT',
        };
      logger.error('setAvatar unavailable');
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
export const removeAvatar = withAuth(
  async (session): Promise<ActionResult<{ message: string }>> => {
    try {
      await dbConnect();
      await removeWebAvatar(mongoose.connection.db!, session.userId);
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      if (error instanceof AvatarWriteError)
        return {
          success: false,
          error: error.code,
          code:
            error.code === 'NOT_FOUND'
              ? 'NOT_FOUND'
              : error.code === 'VALIDATION_ERROR'
                ? 'VALIDATION_ERROR'
                : 'CONFLICT',
        };
      logger.error('removeAvatar unavailable');
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
