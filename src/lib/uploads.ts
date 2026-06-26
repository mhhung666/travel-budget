import { randomUUID } from 'crypto';

/**
 * Blob 上傳的純邏輯：content-type 白名單、大小上限、物件 key 產生。
 *
 * 刻意不 import AWS SDK / env，維持可單元測試且不污染。實際與 R2 互動的 client
 * 包裝在 [storage.ts](./storage.ts)（server-only）。大小上限為**伺服器端硬性防線**——
 * 前端會先壓縮（見 imageCompress.ts），但壓縮只是優化、非安全邊界，故此處仍硬擋。
 */

export type UploadKind = 'receipt' | 'avatar';

// 硬性上限。前端壓縮後通常遠小於此；這裡只擋住惡意/異常的大檔。
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8MB（收據可為未壓縮 PDF）
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB

export const RECEIPT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function uploadConstraints(kind: UploadKind): {
  types: readonly string[];
  maxBytes: number;
} {
  return kind === 'receipt'
    ? { types: RECEIPT_CONTENT_TYPES, maxBytes: MAX_RECEIPT_BYTES }
    : { types: AVATAR_CONTENT_TYPES, maxBytes: MAX_AVATAR_BYTES };
}

export type UploadValidation = { ok: true } | { ok: false; reason: 'type' | 'size' };

export function validateUpload(
  kind: UploadKind,
  contentType: string,
  size: number
): UploadValidation {
  const { types, maxBytes } = uploadConstraints(kind);
  if (!types.includes(contentType)) return { ok: false, reason: 'type' };
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) return { ok: false, reason: 'size' };
  return { ok: true };
}

export function extForContentType(contentType: string): string {
  return EXT_BY_TYPE[contentType] ?? 'bin';
}

/**
 * 產生命名空間化的物件 key。owner 區段（收據用 tripId、頭像用 userId）由伺服器端
 * 帶入（非 client 可控），因此一張簽名 URL 不可能寫到別人的空間，也讓 cascade 刪除
 * 能以 prefix 批次清理。UUID 檔名讓 key 不可猜。
 *
 *   receipt → receipts/<tripId>/<uuid>.<ext>
 *   avatar  → avatars/<userId>/<uuid>.<ext>
 */
export function buildObjectKey(kind: UploadKind, ownerId: string, contentType: string): string {
  const prefix = kind === 'receipt' ? 'receipts' : 'avatars';
  return `${prefix}/${ownerId}/${randomUUID()}.${extForContentType(contentType)}`;
}

/** 收據物件 key 的命名空間前綴：receipts/<tripId>/。 */
export function receiptKeyPrefix(tripId: string): string {
  return `receipts/${tripId}/`;
}

/**
 * 該 key 是否屬於此 trip 的收據空間。用於擋掉「引用別的 trip / 別人的物件 key」——
 * 成員只能把屬於本 trip 前綴的物件掛成附件，或簽發本 trip 的收據檢視 URL。
 */
export function isReceiptKeyForTrip(tripId: string, key: string): boolean {
  return tripId.length > 0 && key.startsWith(receiptKeyPrefix(tripId));
}
