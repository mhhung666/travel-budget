import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Photo } from '@/models';
import { isValidHashCode } from '@/lib/hashcode';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { logger } from '@/lib/logger';
import { toPublicAlbumPhotoDto, type PublicAlbumPhotoDtoInput } from '@/lib/dto';
import { ensureSanitizedPhotoCopies } from '@/lib/photoSanitize';
import { presignGetStable } from '@/lib/storage';
import { isPhotoKeyForTrip, sanitizedPhotoKey } from '@/lib/uploads';
import type { PublicAlbumPhoto } from '@/types';

/**
 * 公開（不需登入）相簿分享資料（PLAN-PHOTOS Phase 4 §8）。
 *
 * 以旅程的 `albumShareCode` 反查，回「純相片牌」：相片＋說明＋日期＋旅程名，
 * **不含** location／place／exif／上傳者／旅程 id／成員名單。分享為 opt-in；
 * 未產生分享碼（或已撤銷）一律 404。
 *
 * **兩條位置外洩路徑同時切斷**：
 *   ① 檔案裡的 EXIF GPS → 只簽剝除 APP1 的消毒副本 `_p.jpg`（`ensureSanitizedPhotoCopies`
 *      先補齊、self-heal），**絕不簽**自帶 GPS 的顯示檔 `.jpg`。
 *   ② 頁面上的座標 → DTO 是獨立型別，型別上根本沒有位置欄位（見 toPublicAlbumPhotoDto）。
 *
 * 收據永不進相簿分享：只簽 `photos/` 前綴、且逐顆 `isPhotoKeyForTrip` 覆核。
 */

interface PublicAlbumResponse {
  trip_name: string;
  photos: PublicAlbumPhoto[];
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    // 格式不符視同不存在（避免把無效輸入打進 DB）。
    if (!isValidHashCode(code)) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    await dbConnect();

    const trip = await Trip.findOne({ albumShareCode: code })
      .select('_id name')
      .lean<{ _id: Types.ObjectId; name: string }>();
    if (!trip) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }
    const tripId = trip._id.toString();

    // 補齊／self-heal 消毒副本（分享後才上傳、或先前產生失敗漏掉的）。穩態＝一次 list、零產生。
    await ensureSanitizedPhotoCopies(tripId).catch((e) =>
      logger.error('Public album: sanitize self-heal failed', e)
    );

    const photos = await Photo.find({ trip: trip._id })
      .sort({ takenAt: -1, createdAt: -1 })
      .select('_id key thumbKey width height takenAt caption')
      .lean<(PublicAlbumPhotoDtoInput & { key: string; thumbKey: string })[]>();

    const dtos = await Promise.all(
      photos
        // 防禦：只簽本旅程 photos/ 前綴的 key（收據等其他前綴一律排除）。
        .filter((p) => isPhotoKeyForTrip(tripId, p.key) && isPhotoKeyForTrip(tripId, p.thumbKey))
        .map(async (p) => {
          // 只簽消毒副本 `_p.jpg` 與縮圖 `_t.webp`——絕不簽 p.key（顯示 `.jpg`，自帶 GPS）。
          const [url, thumbUrl] = await Promise.all([
            presignGetStable('receipts', sanitizedPhotoKey(p.key)),
            presignGetStable('receipts', p.thumbKey),
          ]);
          return toPublicAlbumPhotoDto(p, { url, thumbUrl });
        })
    );

    const body: PublicAlbumResponse = { trip_name: trip.name, photos: dtos };
    return NextResponse.json(body);
  } catch (error) {
    logger.error('Get public album error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
