'use server';

import { dbConnect } from '@/lib/mongodb';
import { User } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { generateUniqueHashCode } from '@/lib/hashcode';
import { logger } from '@/lib/logger';

/**
 * 旅行地圖公開分享狀態。
 * `enabled` 為 true 時 `code` 必有值；分享關閉時 `code` 為 null。
 */
export interface MapShareStatus {
  enabled: boolean;
  code: string | null;
}

/** 讀取目前登入者的旅行地圖分享狀態。 */
export const getMapShareStatus = withAuth(
  async (session): Promise<ActionResult<MapShareStatus>> => {
    try {
      await dbConnect();
      const user = await User.findById(session.userId)
        .select('mapShareCode')
        .lean<{ mapShareCode?: string | null }>();
      const code = user?.mapShareCode ?? null;
      return { success: true, data: { enabled: Boolean(code), code } };
    } catch (error) {
      logger.error('Get map share status error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 產生（或重新產生）旅行地圖公開分享連結。
 *
 * 重新呼叫會換上一組全新的 hash code，使既有的公開連結立即失效——
 * 這同時是「產生」與「重新產生以撤銷舊連結」的能力（連結外洩時使用）。
 */
export const enableMapShare = withAuth(async (session): Promise<ActionResult<MapShareStatus>> => {
  try {
    await dbConnect();
    const code = await generateUniqueHashCode(
      async (candidate) => (await User.exists({ mapShareCode: candidate })) !== null
    );
    await User.findByIdAndUpdate(session.userId, { $set: { mapShareCode: code } });
    return { success: true, data: { enabled: true, code } };
  } catch (error) {
    logger.error('Enable map share error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/**
 * 關閉旅行地圖分享：移除 mapShareCode，現存的公開連結立即失效。
 */
export const disableMapShare = withAuth(async (session): Promise<ActionResult<MapShareStatus>> => {
  try {
    await dbConnect();
    await User.findByIdAndUpdate(session.userId, { $unset: { mapShareCode: '' } });
    return { success: true, data: { enabled: false, code: null } };
  } catch (error) {
    logger.error('Disable map share error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});
