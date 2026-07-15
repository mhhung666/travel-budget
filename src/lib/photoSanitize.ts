import { Photo } from '@/models';
import { photoKeyPrefix, sanitizedPhotoKey, PHOTO_DISPLAY_CONTENT_TYPE } from '@/lib/uploads';
import { listKeys, getObjectBuffer, putObjectBytes } from '@/lib/storage';
import { stripJpegApp1 } from '@/lib/jpegSanitize';
import { logger } from '@/lib/logger';

/**
 * 相簿公開分享的消毒副本產生器（PLAN-PHOTOS Phase 4 §8）。**server-only**：直接觸碰
 * Mongoose model 與 R2，只可被 server actions／API route 匯入（切勿從 client component）。
 *
 * 顯示檔 `<uuid>.jpg` **刻意自帶完整 EXIF（含公尺級 GPS）**，公開路由絕不可簽它；改簽
 * 剝除 APP1 的 `<uuid>_p.jpg`。這支就是把每張相片的 `_p.jpg` 補齊。
 *
 * **idempotent**：先 list 出 `photos/<tripId>/` 底下已存在的 key，只對「缺 `_p.jpg`」的
 * 相片做 `GET .jpg → stripJpegApp1 → PUT _p.jpg`。穩態（都在）＝一次 list、零產生。
 * 由三處呼叫：`enableAlbumShare`（開分享時先備好）、`addTripPhotos`（分享中新上傳補產）、
 * 公開路由（self-heal 漏網的）。多做無害——刪不存在 key 對 R2 是 no-op。
 *
 * **best-effort**：個別相片產生失敗只 log、不 throw（其餘照常）；呼叫端不應因此讓使用者
 * 的操作失敗。真的漏了某張，公開頁那張大圖 404，縮圖（本就無 EXIF）仍在。
 */

/** 並行上限：一次同時處理幾張（避免對 R2 灌爆連線）。 */
const CONCURRENCY = 8;

export async function ensureSanitizedPhotoCopies(tripId: string): Promise<void> {
  const displayKeys = await Photo.find({ trip: tripId })
    .select('key')
    .lean<{ key: string }[]>()
    .then((rows) => rows.map((r) => r.key));
  if (displayKeys.length === 0) return;

  const existing = new Set(await listKeys('receipts', photoKeyPrefix(tripId)));
  const missing = displayKeys.filter((k) => !existing.has(sanitizedPhotoKey(k)));

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    await Promise.all(missing.slice(i, i + CONCURRENCY).map(sanitizeOne));
  }
}

/** 對單一顯示檔 key 產生其 `_p.jpg`。失敗只 log。 */
async function sanitizeOne(key: string): Promise<void> {
  try {
    const bytes = await getObjectBuffer('receipts', key);
    if (!bytes) return; // 顯示檔不存在（異常）——跳過，別產出空的 _p
    const stripped = stripJpegApp1(bytes);
    await putObjectBytes('receipts', sanitizedPhotoKey(key), PHOTO_DISPLAY_CONTENT_TYPE, stripped);
  } catch (e) {
    logger.error('ensureSanitizedPhotoCopies: sanitize failed', { key, error: e });
  }
}
