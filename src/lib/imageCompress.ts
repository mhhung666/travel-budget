'use client';

import imageCompression from 'browser-image-compression';

/**
 * 上傳前的 client 端圖片壓縮。因為走 presigned PUT「瀏覽器直傳 R2」，server 看不到
 * bytes，故在這裡壓最自然——同時也省使用者的上傳流量（出國漫遊情境）。
 *
 * - 非圖片（如 PDF 收據）原樣放行（canvas 壓不了）。
 * - 壓縮失敗（例如瀏覽器無法解碼的 HEIC）退回原檔，讓上傳仍能進行（仍受伺服器端
 *   大小上限把關，見 uploads.ts）。
 * - 統一輸出 WebP（壓縮率好、瀏覽器普遍支援）。
 */

export type CompressPreset = 'receipt' | 'avatar';

const PRESETS: Record<CompressPreset, { maxWidthOrHeight: number; maxSizeMB: number }> = {
  receipt: { maxWidthOrHeight: 1600, maxSizeMB: 0.8 }, // 維持可讀（對帳看得清）
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.2 },
};

export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    const { maxWidthOrHeight, maxSizeMB } = PRESETS[preset];
    const out = await imageCompression(file, {
      maxWidthOrHeight,
      maxSizeMB,
      useWebWorker: true,
      fileType: 'image/webp',
    });
    const baseName = file.name.replace(/\.[^./\\]+$/, '');
    return new File([out], `${baseName}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}
