import type { Location } from '../common/location';
import type { TripRole } from './user';
import type { Budget } from './budget';

/**
 * 旅程基本資訊
 */
export interface Trip {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  departure_location: Location | null;
  destination_location: Location | null;
  hash_code: string;
  created_at: string;
  /** 軟性封存時間；null 代表未封存 */
  archived_at: string | null;
  /** 旅程預算（基準幣 TWD）；null 代表尚未設定 */
  budget: Budget | null;
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
