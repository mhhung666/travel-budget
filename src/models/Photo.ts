import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 旅程相簿的一張相片。比照 Note／Checklist 為旅程下的獨立子集合（ref `trip`），
 * 採**成員信任模型**（任何成員皆可上傳／編輯／刪除）。
 * `uploadedByName` 為上傳當下快照（比照 Note.authorName），讀取免 populate。
 *
 * 每張相片在 R2 有兩顆物件（私有 receipts bucket，前綴 `photos/<tripId>/`，
 * 共用同一個 uuid，見 buildPhotoObjectKeys）：
 *   - `key`      顯示＋下載（長邊 2560 的 JPEG，**自帶完整 EXIF 含 GPS**）
 *   - `thumbKey` 縮圖（長邊 400 的 WebP，grid 用，canvas 產生故無 EXIF）
 *
 * 檢視走 presignGetStable 簽發的「窗口內穩定」URL（相簿一頁幾十張，簽名若每次都變
 * 會打爆 SW 的 CacheFirst 快取，見 storage.ts）。
 */

/**
 * EXIF 中繼資料。與**檔案裡自帶的那份 EXIF 不重複、各司其職**：檔案那份是給使用者
 * 帶走的（存回手機後 Apple 照片／Google 相簿要讀得到地點），這份是給 app 查的——
 * 地圖釘點、依拍攝時間排序、「找出這顆鏡頭拍的」，不可能為了讀 metadata 去下載
 * 解析每一顆 JPEG。全部 optional：缺就是缺，不要用 0 當「沒有」。
 */
const PhotoExifSchema = new Schema(
  {
    make: { type: String },
    model: { type: String },
    lens: { type: String },
    iso: { type: Number },
    fNumber: { type: Number },
    exposureTime: { type: Number },
    focalLength: { type: Number },
    /**
     * **原檔**的 Orientation（1–8），與檔案裡那份 EXIF 的值**刻意不同**：
     * `preserveExif` 搬 EXIF 進壓縮檔時會把 Orientation 重設為 1
     * （`copyExifWithoutOrientation`），因為 canvas 已經把旋轉烤進像素了。
     *
     * 所以這個值是**歷史紀錄，不是渲染指令**——拿它去轉 `key` 指向的圖，
     * 就是把已經轉正的照片再轉一次（照片躺著）。顯示相片一律不要理會它。
     */
    orientation: { type: Number },
  },
  { _id: false }
);

/**
 * 座標。`source` 是刻意留的欄位，讓「這張為什麼釘在這」可解釋、也讓地圖能依精確度區分：
 *   - `exif`      相片自己的 GPS（街廓級精確度，這是相簿存在的意義）
 *   - `itinerary` 相片沒有 GPS（截圖、關了定位、社群下載圖），退回關聯行程日的座標
 *   - `manual`    使用者手動拉釘
 */
const PhotoLocationSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    source: { type: String, enum: ['exif', 'itinerary', 'manual'], required: true },
  },
  { _id: false }
);

/**
 * 反查地名快照，形狀對齊 ItineraryDay.location。
 *
 * **Phase 1 一律為 null**：repo 目前沒有反查地名（reverse geocode）的能力——
 * ItineraryDay.location 是使用者在前端用 Nominatim **正向搜尋**選好後整包送上來的，
 * server 端從不做地理查詢。座標反查是全新功能，且 Nominatim 政策限 1 req/sec，
 * 塞進上傳流程會讓「一次挑 20 張」變成 20 秒的 server action。
 * 形狀先留好（同 §10 的精神：形狀留好，值可以之後才有），Phase 3 地圖整合時再回頭填。
 */
const PhotoPlaceSchema = new Schema(
  {
    name: { type: String, required: true },
    names: { type: Schema.Types.Mixed, default: {} },
    country_code: { type: String, default: '' },
  },
  { _id: false }
);

const PhotoSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    key: { type: String, required: true },
    thumbKey: { type: String, required: true },
    contentType: { type: String, required: true }, // 一律 image/jpeg（顯示檔）
    size: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },

    // EXIF DateTimeOriginal；缺則退 file.lastModified；再缺為 null（排序落到最後）
    takenAt: { type: Date, default: null },
    location: { type: PhotoLocationSchema, default: null },
    place: { type: PhotoPlaceSchema, default: null },
    exif: { type: PhotoExifSchema, default: () => ({}) },

    // 可選關聯行程日（Phase 2）
    itineraryDay: { type: Schema.Types.ObjectId, ref: 'ItineraryDay', default: null },
    caption: { type: String, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

// 相簿主排序：拍攝時間新到舊
PhotoSchema.index({ trip: 1, takenAt: -1 });
// Phase 2 的行程日分組
PhotoSchema.index({ trip: 1, itineraryDay: 1 });
/**
 * 一顆物件只能被一筆 doc 指向。少了這條，成員可以拿既有相片的 key 再送一次
 * addTripPhotos（那些 key 通得過所有驗證：屬於本團、配對正確、物件真的存在）→
 * 兩筆 doc 共用同兩顆 blob → 刪掉其中一筆時 best-effort 刪除會把 blob 收走，
 * 另一筆的圖就永久 404。
 */
PhotoSchema.index({ key: 1 }, { unique: true });

export type PhotoDoc = InferSchemaType<typeof PhotoSchema>;

export const Photo: Model<PhotoDoc> =
  (mongoose.models.Photo as Model<PhotoDoc>) ?? mongoose.model<PhotoDoc>('Photo', PhotoSchema);
