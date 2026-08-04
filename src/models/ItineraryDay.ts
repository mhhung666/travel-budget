import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** 當日活動的類型。`transport` 僅保留給舊資料，新活動拆成航班與地面交通。 */
export const ACTIVITY_TYPES = [
  'sightseeing',
  'food',
  'flight',
  'ground_transport',
  'transport',
  'accommodation',
  'shopping',
  'activity',
  'other',
] as const;

/**
 * 行程當日的單一活動（內嵌於 ItineraryDay）。比照 Checklist.items：數量有界、整批一起編輯，
 * 由 Mongoose 自動帶 `_id` 作為前端 render key。time/endTime 為 "HH:mm"（24h）字串或 null；
 * confirmationCode 為訂位/票券確認碼（敏感，不外洩到公開分享路由）。
 */
/**
 * 票券附件（訂房單 / 機票 / 入場券）。形狀同 Expense.attachments：存 R2 物件 key + 中繼資料，
 * 不存 url。檔案放**私有 receipts bucket** 的 `itinerary/<tripId>/` 命名空間（與收據共用 bucket、
 * 前綴不同）。屬敏感資訊，公開分享路由不回傳（比照 confirmationCode / 收據）。
 */
const ActivityAttachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ActivitySchema = new Schema({
  // "HH:mm" 24 小時制；null＝未指定時間（渲染時排在有時間的活動之後）
  time: { type: String, default: null },
  endTime: { type: String, default: null },
  title: { type: String, required: true },
  type: { type: String, enum: ACTIVITY_TYPES, default: 'other' },
  // 活動地點（城市/景點），結構同 ItineraryDay.location；null＝未設。
  location: { type: Schema.Types.Mixed, default: null },
  // 未經 geocoding 的純文字地點（例如 AI 匯入）；不可虛構座標塞進 location。
  locationName: { type: String, default: '' },
  note: { type: String, default: '' },
  // 訂位/票券確認碼（航班 PNR、訂房代號…）；屬敏感資訊，公開分享路由不回傳。
  confirmationCode: { type: String, default: '' },
  // 票券附件（內嵌）；舊資料無此欄位時為空陣列。
  attachments: { type: [ActivityAttachmentSchema], default: [] },
});

const ItineraryDaySchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    dayNumber: { type: Number, required: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    // 當日地點（城市等較小範圍），用於旅行地圖的熱點圖；舊資料無此欄位即不計入。
    location: { type: Schema.Types.Mixed },
    // 當日活動時間軸（內嵌）；舊資料無此欄位時為空陣列。
    activities: { type: [ActivitySchema], default: [] },
    // AI 匯入逐日冪等鍵；純伺服器欄位，不進一般／公開 DTO。
    appliedImportKeys: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

// 取代原 (trip_id, day_number) 的 UNIQUE 約束
ItineraryDaySchema.index({ trip: 1, dayNumber: 1 }, { unique: true });

export type ItineraryDayDoc = InferSchemaType<typeof ItineraryDaySchema>;

export const ItineraryDay: Model<ItineraryDayDoc> =
  (mongoose.models.ItineraryDay as Model<ItineraryDayDoc>) ??
  mongoose.model<ItineraryDayDoc>('ItineraryDay', ItineraryDaySchema);
