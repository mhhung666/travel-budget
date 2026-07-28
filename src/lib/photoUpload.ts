'use client';

import { compressImage } from '@/lib/imageCompress';
import { readPhotoExif } from '@/lib/exif';
import { createPhotoUploadUrls } from '@/actions';
import { PHOTO_BATCH_MAX, type PhotoItemInput } from '@/lib/validation';

/**
 * 相簿相片的選檔→上傳流程。與收據／隨手記共用的 uploadAttachmentFiles **刻意分家**，
 * 因為相片多了三件那條路徑沒有的事：
 *   1. **壓縮前**先讀 EXIF（canvas 之後就永遠讀不到了）
 *   2. 一張相片產出**兩顆**物件（顯示檔＋縮圖），共用一組簽名
 *   3. 量測壓縮**輸出**的實際尺寸（供 grid 排版，避免載入時跳版）
 *
 * 流程：
 * ```
 * 選檔 → readPhotoExif(原始 File)        ← 必須在任何 canvas 操作之前
 *      → compressImage(file, 'photo')     ← JPEG 3264 + preserveExif（壓縮檔自帶 EXIF）
 *      → compressImage(file, 'photoThumb')← WebP 400（縮圖不需 EXIF）
 *      → 一次取兩張簽名 → 兩顆直傳 R2 → 回傳 addTripPhotos 的 item
 * ```
 */

/** 前端的檔案大小防線。伺服器端的 MAX_PHOTO_BYTES 擋的是**壓縮後**的結果；這條擋的是
 *  「瀏覽器解碼會直接卡死」的異常輸入。單眼直出的 12MB JPEG 壓縮後一樣是 1MB 上下，
 *  沒有理由擋，所以線拉得很鬆。 */
export const MAX_PHOTO_SOURCE_BYTES = 50 * 1024 * 1024;

/**
 * 同時處理幾個檔案。**不要拿掉這個限制改用 `Promise.all` 一次全開**：
 * 每個檔案都要跑兩次 canvas 壓縮（一次 3264px、一次 400px）＋一次 `createImageBitmap`，
 * 20 張同時解碼在桌機沒事，在 iPhone Safari 上就是整頁 OOM 重載。
 * 上傳相簿時使用者正盯著進度，慢一點無妨，掛掉不行。
 */
const UPLOAD_CONCURRENCY = 3;

export type PhotoUploadFailure = 'too-large' | 'unsupported' | 'failed';

export interface PhotoUploadResult {
  /** 成功直傳 R2、可送進 addTripPhotos 的項目。 */
  items: PhotoItemInput[];
  /** 失敗的檔案（檔名 + 原因），呼叫端據此顯示訊息。 */
  failures: { name: string; reason: PhotoUploadFailure }[];
}

/** 量測一個圖片檔的實際像素尺寸。失敗回 0（DTO 端會退回 0，不擋上傳）。 */
async function measure(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

async function putObject(uploadUrl: string, file: File): Promise<boolean> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  return res.ok;
}

async function uploadOne(
  tripId: string,
  original: File
): Promise<{ item: PhotoItemInput } | { reason: PhotoUploadFailure }> {
  if (original.size > MAX_PHOTO_SOURCE_BYTES) return { reason: 'too-large' };

  // 1. EXIF 一定要在壓縮前讀——compressImage 走的是 canvas，重繪出來的是一個全新的、
  //    沒有 metadata 的檔案。這裡讀到的是給 DB 查詢用的那一份。
  const exif = await readPhotoExif(original);

  // 2. 顯示檔（JPEG + preserveExif：壓縮檔自己也會帶著 EXIF 給使用者下載回手機）
  //    與縮圖（WebP）。刻意循序、不並行——見 UPLOAD_CONCURRENCY，兩次 canvas 解碼
  //    同一張大圖同時跑，在手機上是最容易炸掉的組合。
  const display = await compressImage(original, 'photo');
  const thumb = await compressImage(original, 'photoThumb');

  // 壓縮失敗時 compressImage 會**原樣退回傳進去的那個 File 物件**（見 imageCompress.ts），
  // 成功時回的是 `new File(...)`。故用**同一性**判斷失敗，而不是看 type：
  // 光看 `type !== 'image/jpeg'` 只抓得到非 JPEG 的輸入（桌面拖放的 .heic），
  // 一張 APP1 損毀的 JPEG 壓縮失敗後退回的原檔 type 正好也是 image/jpeg，
  // 會整個穿透檢查、被全解析度悄悄傳上去。
  if (display === original || thumb === original) {
    return { reason: 'unsupported' };
  }

  const { width, height } = await measure(display);

  const tickets = await createPhotoUploadUrls(
    tripId,
    { contentType: display.type, size: display.size },
    { contentType: thumb.type, size: thumb.size }
  );
  if (!tickets.success) return { reason: 'failed' };

  const [displayOk, thumbOk] = await Promise.all([
    putObject(tickets.data.display.uploadUrl, display),
    putObject(tickets.data.thumb.uploadUrl, thumb),
  ]);
  if (!displayOk || !thumbOk) return { reason: 'failed' };

  return {
    item: {
      key: tickets.data.display.key,
      thumb_key: tickets.data.thumb.key,
      width,
      height,
      taken_at: exif.taken_at,
      taken_local_date: exif.taken_local_date,
      taken_date_source: exif.taken_date_source,
      location: exif.location,
      exif: exif.exif,
    },
  };
}

/** 把清單切成每組至多 size 個。 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 以固定併發數跑完整個清單，保留原順序。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 上傳一批相片到 R2 並回傳可入庫的項目。**不呼叫 addTripPhotos**——那一步由呼叫端的
 * mutation 做，讓「傳檔」與「入庫」的錯誤能分開處理（傳了一半失敗，成功的那些仍可入庫）。
 *
 * 逐檔獨立失敗：一張壞檔不該讓另外 19 張跟著陪葬。
 *
 * **呼叫端要負責分批**（每批 ≤ `PHOTO_BATCH_MAX`）——`addTripPhotos` 的 Zod 一次只收
 * 這麼多。這裡會硬性截斷超出的部分並回報，因為若讓它們傳上去才被 server 整批打回，
 * 那些物件就成了永遠沒人指向的 R2 孤兒。見 uploadPhotoFilesInBatches。
 */
export async function uploadPhotoFiles(
  files: File[],
  opts: { tripId: string }
): Promise<PhotoUploadResult> {
  const accepted = files.slice(0, PHOTO_BATCH_MAX);
  const overflow = files.slice(PHOTO_BATCH_MAX);

  const results = await mapWithConcurrency(accepted, UPLOAD_CONCURRENCY, async (file) => ({
    file,
    result: await uploadOne(opts.tripId, file),
  }));

  const items: PhotoItemInput[] = [];
  const failures: { name: string; reason: PhotoUploadFailure }[] = [];
  for (const { file, result } of results) {
    if ('item' in result) items.push(result.item);
    else failures.push({ name: file.name, reason: result.reason });
  }
  // 沒傳就沒有孤兒——超出的部分連壓縮都不做。
  for (const file of overflow) failures.push({ name: file.name, reason: 'failed' });
  return { items, failures };
}

/**
 * 選一次檔就把所有相片傳完，自動切成每批 `PHOTO_BATCH_MAX` 張。
 *
 * 「一次把整趟旅程的照片丟進去」是相簿的預設用法，所以 20 張這條界線不該由使用者
 * 自己記得——由這裡切。每批傳完就交給 `onBatch` 入庫再傳下一批，好處是中途失敗
 * （關頁、離線）時，前面幾批**已經進資料庫了**，不會整趟白費。
 */
export async function uploadPhotoFilesInBatches(
  files: File[],
  opts: { tripId: string; onBatch: (items: PhotoItemInput[]) => Promise<void> }
): Promise<{ uploaded: number; failures: { name: string; reason: PhotoUploadFailure }[] }> {
  let uploaded = 0;
  const failures: { name: string; reason: PhotoUploadFailure }[] = [];

  for (const batch of chunk(files, PHOTO_BATCH_MAX)) {
    const result = await uploadPhotoFiles(batch, { tripId: opts.tripId });
    failures.push(...result.failures);
    if (result.items.length > 0) {
      await opts.onBatch(result.items);
      uploaded += result.items.length;
    }
  }
  return { uploaded, failures };
}
