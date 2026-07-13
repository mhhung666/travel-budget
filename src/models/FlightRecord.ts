import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];

/** 歷史回填用的日期精度：只記得年份/月份的舊旅行也能補登。 */
export const DATE_PRECISIONS = ['day', 'month', 'year'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/**
 * 飛行紀錄（ROADMAP #19 旅行成就）——**user-level 終身紀錄**，非 trip-scoped：
 * 紀錄可早於 app 裡的任何旅程（歷史回填），也不因旅程刪除而消失。
 * `trip` 為可選連結；deleteTrip 對本 collection 是「解除連結（置 null）」而非刪除
 * （刻意偏離「刪 trip 手動級聯刪除」慣例，見 ROADMAP #19）。
 * 個人隱私資料：只有本人可讀寫（actions 以 `{ _id, user }` 過濾），不進公開分享路由。
 *
 * `airline` 存 IATA 二碼（目錄見 public/data/airlines.json，由 scripts/generate-catalogs.mjs
 * 產生）；伺服端只驗格式不驗目錄（目錄在前端延遲載入，缺碼時 UI 退回顯示原始代碼）。
 */
const FlightRecordSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null },
    date: { type: Date, required: true },
    datePrecision: { type: String, enum: DATE_PRECISIONS, default: 'day' },
    // IATA 航空公司代碼（如 BR / JL / 9C）
    airline: { type: String, required: true, uppercase: true, trim: true },
    // 完整航班號（如 BR182）；'' = 未填
    flightNo: { type: String, default: '', uppercase: true, trim: true },
    // IATA 機場代碼（如 TPE）；null = 未填
    fromAirport: { type: String, default: null, uppercase: true, trim: true },
    toAirport: { type: String, default: null, uppercase: true, trim: true },
    cabin: { type: String, enum: CABIN_CLASSES, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// 成就頁一次撈「我的全部飛行」依日期新到舊
FlightRecordSchema.index({ user: 1, date: -1 });
// deleteTrip 解除連結（updateMany by trip）
FlightRecordSchema.index({ trip: 1 });

export type FlightRecordDoc = InferSchemaType<typeof FlightRecordSchema>;

export const FlightRecord: Model<FlightRecordDoc> =
  (mongoose.models.FlightRecord as Model<FlightRecordDoc>) ??
  mongoose.model<FlightRecordDoc>('FlightRecord', FlightRecordSchema);
