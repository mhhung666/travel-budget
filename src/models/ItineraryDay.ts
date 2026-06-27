import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** 當日活動的類型。與 EXPENSE_CATEGORIES 是不同概念（活動含景點等非支出項），故獨立列舉。 */
export const ACTIVITY_TYPES = [
  'sightseeing',
  'food',
  'transport',
  'accommodation',
  'activity',
  'other',
] as const;

/**
 * 行程當日的單一活動（內嵌於 ItineraryDay）。比照 Checklist.items：數量有界、整批一起編輯，
 * 由 Mongoose 自動帶 `_id` 作為前端 render key。time/endTime 為 "HH:mm"（24h）字串或 null；
 * confirmationCode 為訂位/票券確認碼（敏感，不外洩到公開分享路由）。
 */
const ActivitySchema = new Schema({
  // "HH:mm" 24 小時制；null＝未指定時間（渲染時排在有時間的活動之後）
  time: { type: String, default: null },
  endTime: { type: String, default: null },
  title: { type: String, required: true },
  type: { type: String, enum: ACTIVITY_TYPES, default: 'other' },
  // 活動地點（城市/景點），結構同 ItineraryDay.location；null＝未設。
  location: { type: Schema.Types.Mixed, default: null },
  note: { type: String, default: '' },
  // 訂位/票券確認碼（航班 PNR、訂房代號…）；屬敏感資訊，公開分享路由不回傳。
  confirmationCode: { type: String, default: '' },
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
