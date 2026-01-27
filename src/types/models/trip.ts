import type { Location } from '../common/location';
import type { TripRole } from './user';

/**
 * 旅程基本資訊
 */
export interface Trip {
  id: number;
  name: string;
  description: string | null;
  hash_code: string;
  start_date: string | null;
  end_date: string | null;
  location: Location | null;
  created_at: string;
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
  id: number;
  trip_id: number;
  user_id: number;
  joined_at: string;
}
