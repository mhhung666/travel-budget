'use server';

import { dbConnect } from '@/lib/mongodb';
import { Trip } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { ensureSanitizedPhotoCopies } from '@/lib/photoSanitize';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { generateUniqueHashCode } from '@/lib/hashcode';
import { logger } from '@/lib/logger';

/**
 * 旅程相簿公開分享（PLAN-PHOTOS Phase 4 §8）。比照 mapShare.actions.ts，但**trip-scoped**：
 * 相簿歸屬旅程（成員信任模型），故每支先 `getTripMembership`（無 RLS，每個 action 自己驗）。
 *
 * 公開頁是「純相片牌」——只有相片＋說明＋日期＋旅程名，不含位置。公開路由只簽剝除 APP1 的
 * 消毒副本 `_p.jpg`（見 photoSanitize.ts），絕不簽自帶 GPS 的顯示檔 `.jpg`。
 */

/** 相簿公開分享狀態。`enabled` 為 true 時 `code` 必有值；關閉時為 null。 */
export interface AlbumShareStatus {
  enabled: boolean;
  code: string | null;
}

/** 讀取旅程相簿的分享狀態。 */
export const getAlbumShareStatus = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<AlbumShareStatus>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const trip = await Trip.findById(membership.tripId)
        .select('albumShareCode')
        .lean<{ albumShareCode?: string | null }>();
      const code = trip?.albumShareCode ?? null;
      return { success: true, data: { enabled: Boolean(code), code } };
    } catch (error) {
      logger.error('Get album share status error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 產生（或重新產生）相簿公開分享連結。重新呼叫會換上一組全新 hash code，使舊連結立即失效
 * （既是「產生」也是「連結外洩時撤銷重發」）。
 *
 * 產碼後**先把所有既有相片的消毒副本 `_p.jpg` 備好**，讓分享連結一貼出去就能用（否則要等第一位
 * 訪客觸發 self-heal）。best-effort：消毒失敗不擋分享開啟（公開路由仍會自我補救）。
 */
export const enableAlbumShare = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<AlbumShareStatus>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      await dbConnect();
      const code = await generateUniqueHashCode(
        async (candidate) => (await Trip.exists({ albumShareCode: candidate })) !== null
      );
      await Trip.findByIdAndUpdate(membership.tripId, { $set: { albumShareCode: code } });

      await ensureSanitizedPhotoCopies(membership.tripId).catch((e) =>
        logger.error('Enable album share: sanitize pre-warm failed', e)
      );

      return { success: true, data: { enabled: true, code } };
    } catch (error) {
      logger.error('Enable album share error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 關閉相簿分享：移除 albumShareCode，現存公開連結立即失效（404）。 */
export const disableAlbumShare = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<AlbumShareStatus>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      await Trip.findByIdAndUpdate(membership.tripId, { $unset: { albumShareCode: '' } });
      return { success: true, data: { enabled: false, code: null } };
    } catch (error) {
      logger.error('Disable album share error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
