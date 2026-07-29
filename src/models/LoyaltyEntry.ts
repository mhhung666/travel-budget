import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { LOYALTY_PROGRAMS, LOYALTY_ENTRY_TYPES } from '@/constants/loyalty';

/**
 * 會籍積分／里數的進出 ledger（docs/PLAN-LOYALTY.md）——**唯一加總來源**：
 * 飛行與非飛行來源（信用卡/酒店/餐飲）都走同一條路，進度計算只查本 collection。
 * 數字由使用者從航空 app 抄過來手動記；app 不自動計算（見 LoyaltyAccount 註解）。
 *
 * user-level 個人資料，隱私比照 LoyaltyAccount。刻意**不在 FlightRecord 上加積分
 * 欄位**：「從飛行紀錄帶入」＝建一筆 type 'flight' 的 entry 並存 `flightRecord` ref，
 * UI 以此判斷「已帶入」防重複（同 FlightRecord ↔ sourceActivity 的既有模式）。
 * 飯店會籍以 `qualifyingNights`／`qualifyingSpendUsd`／`rewardPoints` 記錄，
 * `stayRecord` 連結住宿收藏並防止重複帶入。
 */
const LoyaltyEntrySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    program: { type: String, enum: LOYALTY_PROGRAMS, required: true },
    date: { type: Date, required: true },
    type: { type: String, enum: LOYALTY_ENTRY_TYPES, required: true },
    // 會籍積分（CX/CI 積分制）；adjust/沖銷可為負
    statusPoints: { type: Number, default: 0 },
    // 卡籍哩程（BR 哩程＋航段制用；積分制 program 恆 0）
    qualifyingMiles: { type: Number, default: 0 },
    // 可花里數變動（兌換、過期沖銷為負）
    awardMiles: { type: Number, default: 0 },
    // 飯店合格房晚（MB；特定品牌可為 0.5，adjust 可為負）
    qualifyingNights: { type: Number, default: 0 },
    qualifyingStays: { type: Number, default: 0 },
    eliteQualifyingPoints: { type: Number, default: 0 },
    // 飯店年度合格消費（USD；大使級門檻用，adjust 可為負）
    qualifyingSpendUsd: { type: Number, default: 0 },
    // 飯店可用點數變動（兌換、過期沖銷為負）
    rewardPoints: { type: Number, default: 0 },
    // 自家航班（CI「積分 ≥50% 來自自家」條款、BR 航段判定用；Phase 1 先入庫）
    ownAirline: { type: Boolean, default: false },
    // 來源飛行紀錄（「從飛行紀錄帶入」時記錄，防重複帶入）；手動補登為 null
    flightRecord: { type: Schema.Types.ObjectId, ref: 'FlightRecord', default: null },
    // 來源住宿紀錄（「從住宿收藏帶入」時記錄，防重複帶入）；手動補登為 null
    stayRecord: { type: Schema.Types.ObjectId, ref: 'StayRecord', default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// 會籍頁一次撈某 program 的全部 entries 依日期新到舊
LoyaltyEntrySchema.index({ user: 1, program: 1, date: -1 });
// 「已帶入」判斷與 deleteFlightRecord 時的反向查詢
LoyaltyEntrySchema.index({ flightRecord: 1 });
LoyaltyEntrySchema.index({ stayRecord: 1 });

export type LoyaltyEntryDoc = InferSchemaType<typeof LoyaltyEntrySchema>;

export const LoyaltyEntry: Model<LoyaltyEntryDoc> =
  (mongoose.models.LoyaltyEntry as Model<LoyaltyEntryDoc>) ??
  mongoose.model<LoyaltyEntryDoc>('LoyaltyEntry', LoyaltyEntrySchema);
