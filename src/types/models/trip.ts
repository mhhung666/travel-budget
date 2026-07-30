import type { Location } from '../common/location';
import type { TripRole } from './user';
import type { Budget } from './budget';

/**
 * 旅程常用幣別（含可選的自訂匯率）。
 * rate：1 單位外幣 = ? TWD；null 代表用即時匯率。TWD 為基準幣，rate 恆為 null。
 */
export interface TripCurrency {
  code: string;
  rate: number | null;
}

/**
 * 旅程幣別設定。default_currency 為新增支出的預設幣別（null = TWD）；
 * currencies 為常用幣別清單。改設定不追溯既有支出。
 */
export interface TripCurrencySettings {
  default_currency: string | null;
  currencies: TripCurrency[];
}

/**
 * 旅程基本資訊
 */
export interface Trip {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  destination_location: Location | null;
  hash_code: string;
  created_at: string;
  /** 軟性封存時間；null 代表未封存 */
  archived_at: string | null;
  /** 目前登入者在此旅程的個人預算（基準幣 TWD）；公開情境或未設定時為 null */
  budget: Budget | null;
  /** 舊版團體預算，僅供設定個人預算時參考；公開情境不回傳 */
  legacy_budget: Budget | null;
  /** 旅程幣別設定（常用幣別／自訂匯率／預設幣別）；null 代表尚未設定 */
  currency_settings: TripCurrencySettings | null;
}

/**
 * 旅程資訊（含成員數量和當前用戶角色）
 */
export interface TripWithMembers extends Trip {
  member_count: number;
  role?: TripRole;
}

/**
 * 旅程成員關聯
 */
export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string;
  joined_at: string;
}
