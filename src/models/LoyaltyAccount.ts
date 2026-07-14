import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LOYALTY_PROGRAMS } from '@/constants/loyalty';

/**
 * 會籍帳戶（docs/PLAN-LOYALTY.md）——使用者在某會籍計畫的狀態，一人一 program 一筆。
 * 與 FlightRecord 同屬 **user-level 終身資料**：非 trip-scoped、只有本人可讀寫
 * （actions 以 `{ user }` 過濾），**不進任何公開分享路由**（會籍屬敏感個資，
 * 連彙總數字都不進公開收藏牆）。
 *
 * `currentTier` 由使用者自行設定——app 不自動升降級（積分來源含 app 外的信用卡/
 * 酒店消費，自動判級永遠對不上官方），只依 constants/loyalty.ts 門檻顯示進度。
 */
const LoyaltyAccountSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // program key（enum 集中在 constants/loyalty.ts；未來擴 CI/BR/飯店計畫）
    program: { type: String, enum: LOYALTY_PROGRAMS, required: true },
    // program 專屬 tier key（合法值由 action 以 programTierKeys 驗證）
    currentTier: { type: String, required: true },
    // 卡籍效期（BR 兩年制用；CX 曆年制恆 null）
    tierExpiresAt: { type: Date, default: null },
    // 會員號（僅顯示用，選填）
    memberNo: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

LoyaltyAccountSchema.index({ user: 1, program: 1 }, { unique: true });

export type LoyaltyAccountDoc = InferSchemaType<typeof LoyaltyAccountSchema>;

export const LoyaltyAccount: Model<LoyaltyAccountDoc> =
  (mongoose.models.LoyaltyAccount as Model<LoyaltyAccountDoc>) ??
  mongoose.model<LoyaltyAccountDoc>('LoyaltyAccount', LoyaltyAccountSchema);
