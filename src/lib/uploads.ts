import { randomUUID } from 'crypto';

/**
 * Blob 上傳的純邏輯：content-type 白名單、大小上限、物件 key 產生。
 *
 * 刻意不 import AWS SDK / env，維持可單元測試且不污染。實際與 R2 互動的 client
 * 包裝在 [storage.ts](./storage.ts)（server-only）。大小上限為**伺服器端硬性防線**——
 * 前端會先壓縮（見 imageCompress.ts），但壓縮只是優化、非安全邊界，故此處仍硬擋。
 */

// 行程活動的票券附件（訂房單 / 機票 / 入場券）。與收據同性質（私有、可為 PDF），
// 故沿用相同的型別白名單與大小上限——只是命名空間（key 前綴）不同。
export type UploadKind = 'receipt' | 'avatar' | 'itinerary' | 'note';

// 硬性上限。前端壓縮後通常遠小於此；這裡只擋住惡意/異常的大檔。
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8MB（收據可為未壓縮 PDF）
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB
export const MAX_ITINERARY_BYTES = MAX_RECEIPT_BYTES; // 票券同收據（可為 PDF）
export const MAX_NOTE_BYTES = MAX_AVATAR_BYTES; // 隨手記僅圖片（無 PDF），沿用頭像上限

export const RECEIPT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ITINERARY_CONTENT_TYPES = RECEIPT_CONTENT_TYPES;
// 隨手記只收圖片（速記照片，無 PDF 需求），故沿用頭像的圖片白名單。
export const NOTE_CONTENT_TYPES = AVATAR_CONTENT_TYPES;

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
  switch (kind) {
    case 'receipt':
      return { types: RECEIPT_CONTENT_TYPES, maxBytes: MAX_RECEIPT_BYTES };
    case 'itinerary':
      return { types: ITINERARY_CONTENT_TYPES, maxBytes: MAX_ITINERARY_BYTES };
    case 'note':
      return { types: NOTE_CONTENT_TYPES, maxBytes: MAX_NOTE_BYTES };
    case 'avatar':
      return { types: AVATAR_CONTENT_TYPES, maxBytes: MAX_AVATAR_BYTES };
  }
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
 *   receipt   → receipts/<tripId>/<uuid>.<ext>
 *   itinerary → itinerary/<tripId>/<uuid>.<ext>  （與收據共用私有 bucket，前綴不同）
 *   note      → notes/<tripId>/<uuid>.<ext>      （同上，隨手記照片）
 *   avatar    → avatars/<userId>/<uuid>.<ext>
 */
const KEY_PREFIX_BY_KIND: Record<UploadKind, string> = {
  receipt: 'receipts',
  itinerary: 'itinerary',
  note: 'notes',
  avatar: 'avatars',
};

export function buildObjectKey(kind: UploadKind, ownerId: string, contentType: string): string {
  return `${KEY_PREFIX_BY_KIND[kind]}/${ownerId}/${randomUUID()}.${extForContentType(contentType)}`;
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

/** 票券附件物件 key 的命名空間前綴：itinerary/<tripId>/（與收據共用私有 bucket）。 */
export function itineraryKeyPrefix(tripId: string): string {
  return `itinerary/${tripId}/`;
}

/**
 * 該 key 是否屬於此 trip 的票券空間。同 isReceiptKeyForTrip——擋掉引用別團 / 別人物件的
 * key，成員只能把屬於本 trip 前綴的物件掛成活動附件，或簽發本 trip 的票券檢視 URL。
 */
export function isItineraryKeyForTrip(tripId: string, key: string): boolean {
  return tripId.length > 0 && key.startsWith(itineraryKeyPrefix(tripId));
}

/** 隨手記照片物件 key 的命名空間前綴：notes/<tripId>/（與收據共用私有 bucket）。 */
export function noteKeyPrefix(tripId: string): string {
  return `notes/${tripId}/`;
}

/**
 * 該 key 是否屬於此 trip 的隨手記照片空間。同 isReceiptKeyForTrip / isItineraryKeyForTrip——
 * 成員只能把屬於本 trip 前綴的物件掛成筆記照片，或簽發本 trip 的筆記照片檢視 URL。
 */
export function isNoteKeyForTrip(tripId: string, key: string): boolean {
  return tripId.length > 0 && key.startsWith(noteKeyPrefix(tripId));
}

/** 頭像物件 key 的命名空間前綴：avatars/<userId>/。 */
export function avatarKeyPrefix(userId: string): string {
  return `avatars/${userId}/`;
}

/** 該 key 是否屬於此 user 的頭像空間（擋掉設定別人上傳的物件為自己頭像）。 */
export function isAvatarKeyForUser(userId: string, key: string): boolean {
  return userId.length > 0 && key.startsWith(avatarKeyPrefix(userId));
}
