/**
 * 會籍積分與里程紀錄（docs/PLAN-LOYALTY.md）的前端 DTO。
 * user-level 個人資料——不進任何公開分享路由（連彙總數字都不進）。
 */

import type { LoyaltyProgram, LoyaltyEntryType } from '@/constants/loyalty';

export interface LoyaltyAccountItem {
  id: string;
  program: LoyaltyProgram;
  /** program 專屬 tier key（constants/loyalty.ts；使用者已確認的官方卡級）。 */
  current_tier: string;
  /** 目前卡級／升等計算週期起日；逐級制只計此日後的紀錄。 */
  tier_started_at: string | null;
  /** 卡籍效期（YYYY-MM-DD）；term2y 續卡窗口的計算基準（BR/CI）。null＝未設定。 */
  tier_expires_at: string | null;
  /** 會員號；'' = 未填。 */
  member_no: string;
  /** 官方帳戶顯示的終身合格房晚與各級以上年資（飯店計畫用）。 */
  lifetime_nights: number;
  lifetime_silver_years: number;
  lifetime_gold_years: number;
  lifetime_platinum_years: number;
  note: string;
  created_at: string;
}

export interface LoyaltyEntryItem {
  id: string;
  program: LoyaltyProgram;
  /** YYYY-MM-DD（入帳日）。 */
  date: string;
  type: LoyaltyEntryType;
  /** 會籍積分；adjust/沖銷可為負。 */
  status_points: number;
  /** 卡籍哩程（BR 用；積分制恆 0）。 */
  qualifying_miles: number;
  /** 可花里數變動；兌換/過期為負。 */
  award_miles: number;
  /** 飯店合格房晚；特定品牌可為 0.5。 */
  qualifying_nights: number;
  /** 飯店年度合格消費（USD）。 */
  qualifying_spend_usd: number;
  /** 飯店可用點數變動。 */
  reward_points: number;
  /** 自家航班（CI 50% 條款、BR 航段判定用）。 */
  own_airline: boolean;
  /** 來源飛行紀錄 id（「從飛行紀錄帶入」）；null＝手動補登。 */
  flight_record_id: string | null;
  /** 來源住宿紀錄 id（「從住宿收藏帶入」）；null＝手動補登。 */
  stay_record_id: string | null;
  note: string;
  created_at: string;
}

export interface LoyaltyData {
  accounts: LoyaltyAccountItem[];
  /** 全部 program 的 entries，date 新到舊（個人資料量小，前端自行過濾）。 */
  entries: LoyaltyEntryItem[];
}
