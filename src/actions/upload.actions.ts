'use server';

import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { getTripMembership } from '@/lib/permissions';
import {
  validateUpload,
  buildObjectKey,
  buildPhotoObjectKeys,
  PHOTO_DISPLAY_CONTENT_TYPE,
  PHOTO_THUMB_CONTENT_TYPE,
} from '@/lib/uploads';
import { presignPut } from '@/lib/storage';
import { logger } from '@/lib/logger';

/**
 * R2 上傳簽名 actions。回傳一張短效 presigned PUT URL，由 client 把（已壓縮的）
 * bytes 直接 PUT 到 R2，避免大檔流經 server action。owner 區段（收據=tripId、
 * 頭像=userId）一律由伺服器端帶入，client 無法指定，因此不能寫到別人的空間。
 *
 * 注意：presigned PUT 無法限制 client 真正送出的大小/型別，故「存參照」的那一步
 * （PR2/PR3 的 addExpenseAttachment / setAvatar）會再以 headObject 核對。
 */

export type UploadTicket = { uploadUrl: string; key: string };

export const createReceiptUploadUrl = withAuth(
  async (
    session,
    tripIdOrCode: string,
    contentType: string,
    size: number
  ): Promise<ActionResult<UploadTicket>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const v = validateUpload('receipt', contentType, size);
      if (!v.ok) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const key = buildObjectKey('receipt', membership.tripId, contentType);
      const uploadUrl = await presignPut('receipts', key, contentType);
      return { success: true, data: { uploadUrl, key } };
    } catch (error) {
      logger.error('createReceiptUploadUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 票券附件上傳簽名（行程活動用）。owner 區段為 tripId，與收據共用私有 receipts bucket，
 * 只是 key 前綴為 `itinerary/`（見 buildObjectKey）。存參照那一步（updateItineraryDay）
 * 會再以 headObject 核對 size/type。
 */
export const createItineraryUploadUrl = withAuth(
  async (
    session,
    tripIdOrCode: string,
    contentType: string,
    size: number
  ): Promise<ActionResult<UploadTicket>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const v = validateUpload('itinerary', contentType, size);
      if (!v.ok) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const key = buildObjectKey('itinerary', membership.tripId, contentType);
      const uploadUrl = await presignPut('receipts', key, contentType);
      return { success: true, data: { uploadUrl, key } };
    } catch (error) {
      logger.error('createItineraryUploadUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 隨手記照片上傳簽名。owner 區段為 tripId，與收據共用私有 receipts bucket，
 * 只是 key 前綴為 `notes/`（見 buildObjectKey）。存參照那一步（createNote/updateNote）
 * 會再以 headObject 核對 size/type。僅收圖片（NOTE_CONTENT_TYPES）。
 */
export const createNoteUploadUrl = withAuth(
  async (
    session,
    tripIdOrCode: string,
    contentType: string,
    size: number
  ): Promise<ActionResult<UploadTicket>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const v = validateUpload('note', contentType, size);
      if (!v.ok) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const key = buildObjectKey('note', membership.tripId, contentType);
      const uploadUrl = await presignPut('receipts', key, contentType);
      return { success: true, data: { uploadUrl, key } };
    } catch (error) {
      logger.error('createNoteUploadUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 一張相簿相片的兩張上傳簽名（顯示檔＋縮圖）。 */
export type PhotoUploadTickets = {
  display: UploadTicket;
  thumb: UploadTicket;
};

/**
 * 相簿相片上傳簽名。owner 區段為 tripId，與收據共用私有 receipts bucket，前綴為 `photos/`。
 *
 * **一次簽兩張**（而非呼叫兩次）是刻意的：顯示檔與縮圖的 key 必須共用同一個 uuid，
 * 才能讓 `_t`（縮圖）與 `_p`（Phase 4 的消毒副本）從顯示檔 key 推導出來。分兩次呼叫
 * 就會拿到兩個不相干的 uuid，那條規則就沒了（見 buildPhotoObjectKeys）。順帶少一次
 * round trip。
 *
 * 型別逐顆嚴格比對：顯示檔必為 JPEG（EXIF 只在 JPEG→JPEG 存活）、縮圖必為 WebP——
 * key 的副檔名是寫死的，型別對不上就會產生名實不符的物件。
 *
 * 存參照那一步（addTripPhotos）會再以 headObject 核對真實 size/type。
 */
export const createPhotoUploadUrls = withAuth(
  async (
    session,
    tripIdOrCode: string,
    display: { contentType: string; size: number },
    thumb: { contentType: string; size: number }
  ): Promise<ActionResult<PhotoUploadTickets>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      if (
        display.contentType !== PHOTO_DISPLAY_CONTENT_TYPE ||
        thumb.contentType !== PHOTO_THUMB_CONTENT_TYPE
      ) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }
      for (const part of [display, thumb]) {
        const v = validateUpload('photo', part.contentType, part.size);
        if (!v.ok) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }
      }

      const { key, thumbKey } = buildPhotoObjectKeys(membership.tripId);
      const [uploadUrl, thumbUploadUrl] = await Promise.all([
        presignPut('receipts', key, display.contentType),
        presignPut('receipts', thumbKey, thumb.contentType),
      ]);

      return {
        success: true,
        data: {
          display: { uploadUrl, key },
          thumb: { uploadUrl: thumbUploadUrl, key: thumbKey },
        },
      };
    } catch (error) {
      logger.error('createPhotoUploadUrls error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const createAvatarUploadUrl = withAuth(
  async (session, contentType: string, size: number): Promise<ActionResult<UploadTicket>> => {
    try {
      const v = validateUpload('avatar', contentType, size);
      if (!v.ok) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const key = buildObjectKey('avatar', session.userId, contentType);
      const uploadUrl = await presignPut('avatars', key, contentType);
      return { success: true, data: { uploadUrl, key } };
    } catch (error) {
      logger.error('createAvatarUploadUrl error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
