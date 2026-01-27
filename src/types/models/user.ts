/**
 * 用戶基本資訊
 */
export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at?: string;
}

/**
 * 旅程中的角色
 */
export type TripRole = 'admin' | 'member';

/**
 * 旅程成員（包含角色資訊）
 */
export interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
  role: TripRole;
}
