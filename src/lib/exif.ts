import exifr from 'exifr';
import {
  EXIF_STRING_MAX,
  PHOTO_TAKEN_AT_MIN_MS,
  PHOTO_TAKEN_AT_FUTURE_TOLERANCE_MS,
} from '@/lib/validation';

/**
 * 相片 EXIF 讀取與正規化。
 *
 * **為什麼要在 client 讀**：上傳走 presigned PUT「瀏覽器直傳 R2」，server 看不到 bytes，
 * 沒有機會自己解析。所以 EXIF 由 client 抽出、隨 addTripPhotos 一起送上來。
 *
 * **時機很重要**：必須在**任何 canvas 操作之前**讀原始 File。canvas 是純像素表面、
 * 沒有 metadata 概念，壓縮過後再讀就什麼都沒有了。
 *
 * **這裡抽出的是給 DB 查詢用的那一份**，與壓縮檔裡自帶的 EXIF 不重複、各司其職：
 * 地圖釘點、依拍攝時間排序、篩選都不可能為了讀 metadata 去下載解析每一顆 JPEG。
 * 檔案裡那份是給使用者帶走的，DB 這份是給 app 查的。
 *
 * **EXIF 是不可信輸入**：client 送什麼 server 就收什麼，且 server 無法自行重新推導。
 * 這裡的正規化只是「清乾淨」，**不是安全邊界**——真正的把關是 server 端的 Zod
 * （`photoItemSchema`，見 validation.ts）。兩邊的邊界值是**同一份常數**（自 validation.ts
 * import），不是各寫一份靠註解同步。
 */

export { EXIF_STRING_MAX };

/** exifr 解析結果中我們會用到的 tag（全部 unknown：來源不可信，型別要自己驗）。 */
export type RawExifTags = {
  DateTimeOriginal?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  Make?: unknown;
  Model?: unknown;
  LensModel?: unknown;
  ISO?: unknown;
  FNumber?: unknown;
  ExposureTime?: unknown;
  FocalLength?: unknown;
  Orientation?: unknown;
};

/** 相機參數（全部 optional，缺就是缺——不要用 0 當「沒有」）。 */
export type PhotoExifFields = {
  make?: string;
  model?: string;
  lens?: string;
  iso?: number;
  f_number?: number;
  exposure_time?: number;
  focal_length?: number;
  orientation?: number;
};

/** 正規化後、要送給 addTripPhotos 的 EXIF 資料（wire 形狀，snake_case 同 DTO）。 */
export type PhotoExifData = {
  /** ISO 字串；EXIF 無 DateTimeOriginal 時退回呼叫端給的 fallback（file.lastModified）。 */
  taken_at: string | null;
  /**
   * 拍攝當地的日曆日期。EXIF DateTimeOriginal 沒有時區，這裡刻意保留它的年月日，
   * 不從 taken_at 的 UTC 日期反推，避免歐洲凌晨照片被分到前一天。
   */
  taken_local_date: string | null;
  /** 當地日期取自相機 EXIF，或只得退回檔案修改時間。 */
  taken_date_source: 'exif' | 'file' | null;
  /** null＝這張沒有地理資訊（截圖、關了定位、社群下載圖）。 */
  location: { lat: number; lon: number } | null;
  exif: PhotoExifFields;
};

function cleanString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, EXIF_STRING_MAX);
  return s.length > 0 ? s : undefined;
}

/** 有限正數（ISO/光圈/快門/焦距都不可能是 0 或負數；0 代表「沒寫」而非真的是 0）。 */
function positiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function inRange(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
}

/** EXIF Orientation 只有 1–8 有定義。 */
function orientation(v: unknown): number | undefined {
  const n = inRange(v, 1, 8);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/**
 * 把 exifr 的原始 tag 正規化成 wire 形狀。**純函式**（不碰 exifr、不碰 File），
 * 故可單元測試——這是「錯了很安靜」的那類邏輯。
 *
 * 契約：**單一欄位不合格就丟掉該欄位，不是整張拒收**。一張沒有 GPS 的截圖仍是
 * 合法的相片，只是沒有 location。
 *
 * @param raw exifr.parse 的結果（可能是 null／undefined／任意形狀）
 * @param fallbackTakenAtMs EXIF 無拍攝時間時的退路（file.lastModified）
 * @param nowMs 現在時刻（判斷「未來的拍攝時間」用；注入以利測試）
 */
export function normalizePhotoExif(
  raw: RawExifTags | null | undefined,
  fallbackTakenAtMs: number,
  nowMs: number
): PhotoExifData {
  const r = raw ?? {};
  const taken = normalizeTakenAt(r.DateTimeOriginal, fallbackTakenAtMs, nowMs);

  return {
    taken_at: taken.date?.toISOString() ?? null,
    taken_local_date: taken.date ? localCalendarDate(taken.date) : null,
    taken_date_source: taken.source,
    location: normalizeLocation(r.latitude, r.longitude),
    exif: {
      make: cleanString(r.Make),
      model: cleanString(r.Model),
      lens: cleanString(r.LensModel),
      iso: positiveNumber(r.ISO),
      f_number: positiveNumber(r.FNumber),
      exposure_time: positiveNumber(r.ExposureTime),
      focal_length: positiveNumber(r.FocalLength),
      orientation: orientation(r.Orientation),
    },
  };
}

/** 使用 Date 的本地欄位保留 EXIF 的「牆上日期」，不可改成 toISOString().slice(0, 10)。 */
function localCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 拍攝時間：EXIF 優先，不合理或缺漏就退 fallback；fallback 也不合理則無日期。 */
function normalizeTakenAt(
  value: unknown,
  fallbackTakenAtMs: number,
  nowMs: number
): { date: Date | null; source: 'exif' | 'file' | null } {
  const max = nowMs + PHOTO_TAKEN_AT_FUTURE_TOLERANCE_MS;
  const ms = value instanceof Date ? value.getTime() : NaN;
  if (Number.isFinite(ms) && ms >= PHOTO_TAKEN_AT_MIN_MS && ms <= max) {
    // 保留原 Date 物件：它的 local getters 才是 exifr 從無時區 EXIF 解析出的牆上時間。
    return { date: value as Date, source: 'exif' };
  }
  if (
    Number.isFinite(fallbackTakenAtMs) &&
    fallbackTakenAtMs >= PHOTO_TAKEN_AT_MIN_MS &&
    fallbackTakenAtMs <= max
  ) {
    return { date: new Date(fallbackTakenAtMs), source: 'file' };
  }
  return { date: null, source: null };
}

/**
 * 座標：兩軸都要合法才成立（只有一半的座標沒有意義）。
 *
 * (0, 0) 一律視為「沒有座標」：那是幾內亞灣的公海，裝置定位失敗時很常寫出這個值，
 * 誤判成真實座標會在地圖上釘出一顆假的釘子。
 */
function normalizeLocation(
  latValue: unknown,
  lonValue: unknown
): { lat: number; lon: number } | null {
  const lat = inRange(latValue, -90, 90);
  const lon = inRange(lonValue, -180, 180);
  if (lat === undefined || lon === undefined) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/**
 * exifr 的解析選項。這組值是**實測定出來的，別隨手改**：
 *
 * - **不能用 `pick`**：`{ pick: [...], gps: true }` 會靜靜地**不回** `latitude`／`longitude`
 *   （pick 一開，exifr 就不做 GPS 合成）。GPS 是這功能的核心，丟了不會有任何錯誤訊息。
 *   改為明確列出要解析的 block，讓 exifr 照常合成座標。
 * - **`translateValues: false` 是必要的**：預設 exifr 會把數值翻譯成人類可讀字串，
 *   `Orientation` 會變成 `'Rotate 90 CW'` 這種字串而不是數字 6。
 * - 沒有 `ifd0`：它本來就不能停用（Make／Model／Orientation 一律會解析）。
 */
const EXIFR_OPTIONS = {
  exif: true,
  gps: true,
  translateValues: false,
  mergeOutput: true,
} as const;

/**
 * 讀取一個原始 File 的 EXIF。**務必在壓縮前呼叫**（見檔頭）。
 *
 * 解析失敗或檔案根本沒有 EXIF（PNG 截圖、壞檔）都不是錯誤——exifr 這時回 undefined，
 * 我們回一個 location 為 null 的結果，讓相片照樣上傳得成功。
 *
 * 已知取捨：EXIF 的 `DateTimeOriginal` **不帶時區**，exifr 會以**執行環境的時區**解讀它。
 * 所以在台灣上傳巴黎照片時，taken_at 的絕對時刻仍可能偏移；但行程日分類使用的是上面
 * 另外保存的 taken_local_date（Date 的本地年月日），不會拿 UTC 日期判斷，因此巴黎凌晨
 * 照片仍會留在巴黎當地的同一天。相簿內同一批照片的排序也維持一致。
 */
export async function readPhotoExif(file: File): Promise<PhotoExifData> {
  let raw: RawExifTags | null = null;
  try {
    raw = (await exifr.parse(file, EXIFR_OPTIONS)) as RawExifTags | null;
  } catch {
    raw = null;
  }
  return normalizePhotoExif(raw, file.lastModified, Date.now());
}
