/**
 * 用戶基本資訊
 */
export interface User {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
}

/**
 * 旅程中的角色
 */
export type TripRole = 'admin' | 'member';

/**
 * 旅程成員（包含角色資訊）
 */
export interface Member {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  joined_at: string;
  role: TripRole;
  /** 是否為虛擬成員（代付用） */
  is_virtual?: boolean;
}
