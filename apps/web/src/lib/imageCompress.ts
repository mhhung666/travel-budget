'use client';

import imageCompression from 'browser-image-compression';

/**
 * 上傳前的 client 端圖片壓縮。因為走 presigned PUT「瀏覽器直傳 R2」，server 看不到
 * bytes，故在這裡壓最自然——同時也省使用者的上傳流量（出國漫遊情境）。
 *
 * - 非圖片（如 PDF 收據）原樣放行（canvas 壓不了）。
 * - 壓縮失敗（例如瀏覽器無法解碼的 HEIC）退回原檔，讓上傳仍能進行（仍受伺服器端
 *   大小上限/型別白名單把關，見 uploads.ts）。
 *
 * **輸出格式是 preset 的一部分，因為它決定了 EXIF 能不能留**（見下）。
 */

export type CompressPreset = 'receipt' | 'avatar' | 'photo' | 'photoThumb';

type PresetConfig = {
  maxWidthOrHeight: number;
  maxSizeMB: number;
  /** 輸出型別。WebP 壓縮率較好；JPEG 是唯一能保住 EXIF 的選擇（見 preserveExif）。 */
  fileType: 'image/webp' | 'image/jpeg';
  /**
   * 把原檔的 APP1（EXIF）segment 原封搬進壓縮後的輸出。
   *
   * **只在「輸入是 JPEG 且輸出也是 JPEG」時生效**——browser-image-compression 的實作是
   * 直接搬 JPEG 的 APP1 segment，WebP 容器塞不進去（輸出 WebP 一律無 EXIF）。
   * 這也順手處理了 orientation：它搬 EXIF 時會把 Orientation 重設為 1，因為 canvas
   * 已經把旋轉烤進像素，照搬原值會二次旋轉。**別自己手刻 EXIF 注入。**
   */
  preserveExif?: boolean;
};

const PRESETS: Record<CompressPreset, PresetConfig> = {
  receipt: { maxWidthOrHeight: 1600, maxSizeMB: 0.8, fileType: 'image/webp' }, // 維持可讀（對帳看得清）
  avatar: { maxWidthOrHeight: 512, maxSizeMB: 0.2, fileType: 'image/webp' },
  // 相簿顯示＋下載檔：輸出 JPEG 而非 WebP 是刻意的取捨——同畫質下大約 25–30%，
  // 換來壓縮檔自帶完整 EXIF（含 GPS），使用者存回手機時 Apple 照片／Google 相簿讀得到地點。
  // 長邊 3264 ≈ 4:3 下 800 萬畫素；maxSizeMB 抓 4 讓畫質不被硬擠（server 線 = MAX_PHOTO_BYTES 6MB）。
  photo: { maxWidthOrHeight: 3264, maxSizeMB: 4, fileType: 'image/jpeg', preserveExif: true },
  // 相簿 grid 縮圖：不需要 EXIF，故用壓縮率較好的 WebP（canvas 產生，天生無 metadata）。
  photoThumb: { maxWidthOrHeight: 400, maxSizeMB: 0.05, fileType: 'image/webp' },
};

const EXT_BY_FILE_TYPE: Record<PresetConfig['fileType'], string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export async function compressImage(file: File, preset: CompressPreset): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    const { maxWidthOrHeight, maxSizeMB, fileType, preserveExif } = PRESETS[preset];
    const out = await imageCompression(file, {
      maxWidthOrHeight,
      maxSizeMB,
      useWebWorker: true,
      fileType,
      preserveExif,
    });
    const baseName = file.name.replace(/\.[^./\\]+$/, '');
    return new File([out], `${baseName}.${EXT_BY_FILE_TYPE[fileType]}`, { type: fileType });
  } catch {
    return file;
  }
}
