import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LOYALTY_PROGRAMS } from '@/constants/loyalty';

/**
 * 會籍帳戶（docs/PLAN-LOYALTY.md）——使用者在某會籍計畫的狀態，一人一 program 一筆。
 * 與 FlightRecord 同屬 **user-level 終身資料**：非 trip-scoped、只有本人可讀寫
 * （actions 以 `{ user }` 過濾），**不進任何公開分享路由**（會籍屬敏感個資，
 * 連彙總數字都不進公開收藏牆）。
 *
 * `currentTier` 是使用者確認過的官方卡級；app 會依已登記紀錄推估是否達到下一級，
 * 但需使用者確認後才同步，避免漏登信用卡／合作夥伴積分造成誤判。
 */
const LoyaltyAccountSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // program key（enum 集中在 constants/loyalty.ts；未來擴 CI/BR/飯店計畫）
    program: { type: String, enum: LOYALTY_PROGRAMS, required: true },
    // program 專屬 tier key（合法值由 action 以 programTierKeys 驗證）
    currentTier: { type: String, required: true },
    // 目前卡級生效／升等進度起算日；CI/BR 逐級計算時排除升等前紀錄
    tierStartedAt: { type: Date, default: null },
    // 卡籍效期（BR 兩年制用；CX 曆年制恆 null）
    tierExpiresAt: { type: Date, default: null },
    // 會員號（僅顯示用，選填）
    memberNo: { type: String, default: '', trim: true },
    // 飯店終身會籍進度（由官方帳戶手動同步；航空計畫維持 0）
    lifetimeNights: { type: Number, default: 0, min: 0 },
    lifetimeSilverYears: { type: Number, default: 0, min: 0 },
    lifetimeGoldYears: { type: Number, default: 0, min: 0 },
    lifetimePlatinumYears: { type: Number, default: 0, min: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

LoyaltyAccountSchema.index({ user: 1, program: 1 }, { unique: true });

export type LoyaltyAccountDoc = InferSchemaType<typeof LoyaltyAccountSchema>;

export const LoyaltyAccount: Model<LoyaltyAccountDoc> =
  (mongoose.models.LoyaltyAccount as Model<LoyaltyAccountDoc>) ??
  mongoose.model<LoyaltyAccountDoc>('LoyaltyAccount', LoyaltyAccountSchema);
