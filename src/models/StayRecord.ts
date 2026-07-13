import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { DATE_PRECISIONS } from './FlightRecord';

/**
 * 住宿紀錄（ROADMAP #19 旅行成就）——與 FlightRecord 同為 **user-level 終身紀錄**：
 * `trip` 可選連結、deleteTrip 解除連結不刪除、只有本人可讀寫（詳見 FlightRecord 檔頭）。
 *
 * 「品牌」採混合制：`brand` 存精選目錄 id（src/constants/hotelBrands.ts，成就頁品牌牆的
 * 收集單位），null＝獨立旅宿/未知品牌；實際飯店名恆為自由文字 `hotelName`（單一飯店是
 * 開放集合，不做目錄）。`stars` 為使用者自報星級（各國官方星制不一致，不做權威資料）。
 */
const StayRecordSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', default: null },
    checkIn: { type: Date, required: true },
    datePrecision: { type: String, enum: DATE_PRECISIONS, default: 'day' },
    // 住幾晚；null = 未填（歷史回填常見）
    nights: { type: Number, default: null, min: 1 },
    // 品牌目錄 id（hotelBrands.ts）；null = 獨立旅宿/未知品牌
    brand: { type: String, default: null },
    hotelName: { type: String, required: true, trim: true },
    // 自報星級 1–5；null = 未填
    stars: { type: Number, default: null, min: 1, max: 5 },
    // 城市（自由文字）；'' = 未填
    city: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// 成就頁一次撈「我的全部住宿」依入住日新到舊
StayRecordSchema.index({ user: 1, checkIn: -1 });
// deleteTrip 解除連結（updateMany by trip）
StayRecordSchema.index({ trip: 1 });

export type StayRecordDoc = InferSchemaType<typeof StayRecordSchema>;

export const StayRecord: Model<StayRecordDoc> =
  (mongoose.models.StayRecord as Model<StayRecordDoc>) ??
  mongoose.model<StayRecordDoc>('StayRecord', StayRecordSchema);
