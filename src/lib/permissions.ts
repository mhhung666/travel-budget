/**
 * 權限檢查工具函數
 * 用於驗證用戶在旅行中的權限
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export type TripRole = 'admin' | 'member';

/**
 * 檢查用戶是否為旅行的管理員
 * @param userId 用戶 ID
 * @param tripId 旅行 ID (可以是數字 ID 或 hash_code)
 * @returns 是否為管理員
 */
export async function isAdmin(userId: number, tripId: number | string): Promise<boolean> {
  try {
    // 先取得旅行的實際 ID
    const actualTripId = await getTripId(tripId);
    if (!actualTripId) {
      return false;
    }

    // 查詢該用戶在旅行中的角色
    const { data, error } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', actualTripId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * 檢查用戶是否為旅行成員
 * @param userId 用戶 ID
 * @param tripId 旅行 ID (可以是數字 ID 或 hash_code)
 * @returns 是否為成員
 */
export async function isMember(userId: number, tripId: number | string): Promise<boolean> {
  try {
    const actualTripId = await getTripId(tripId);
    if (!actualTripId) {
      return false;
    }

    const { data, error } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', actualTripId)
      .eq('user_id', userId)
      .single();

    return !error && data !== null;
  } catch (error) {
    console.error('Error checking member status:', error);
    return false;
  }
}

/**
 * 取得用戶在旅行中的角色
 * @param userId 用戶 ID
 * @param tripId 旅行 ID (可以是數字 ID 或 hash_code)
 * @returns 角色或 null
 */
export async function getUserRole(
  userId: number,
  tripId: number | string
): Promise<TripRole | null> {
  try {
    const actualTripId = await getTripId(tripId);
    if (!actualTripId) {
      return null;
    }

    const { data, error } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', actualTripId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.role as TripRole;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * 將 tripId (可能是 hash_code) 轉換為實際的數字 ID
 * @param tripId 旅行 ID 或 hash_code
 * @returns 實際的旅行 ID 或 null
 */
export async function getTripId(tripId: number | string): Promise<number | null> {
  // 如果已經是數字,直接返回
  if (typeof tripId === 'number') {
    return tripId;
  }

  // 檢查是否為純數字字串
  if (/^\d+$/.test(tripId)) {
    return parseInt(tripId, 10);
  }

  // 假設是 hash_code,查詢數據庫
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('id')
      .eq('hash_code', tripId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error getting trip ID:', error);
    return null;
  }
}

/**
 * 取得旅行的 hash_code
 * @param tripId 旅行 ID
 * @returns hash_code 或 null
 */
export async function getTripHashCode(tripId: number): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('hash_code')
      .eq('id', tripId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.hash_code;
  } catch (error) {
    console.error('Error getting trip hash code:', error);
    return null;
  }
}

/**
 * 驗證並拋出錯誤 (用於 API routes)
 * @param userId 用戶 ID
 * @param tripId 旅行 ID
 * @throws 如果用戶不是管理員
 */
export async function requireAdmin(userId: number, tripId: number | string): Promise<void> {
  const isUserAdmin = await isAdmin(userId, tripId);
  if (!isUserAdmin) {
    throw new Error('Forbidden: Admin role required');
  }
}

/**
 * 驗證並拋出錯誤 (用於 API routes)
 * @param userId 用戶 ID
 * @param tripId 旅行 ID
 * @throws 如果用戶不是成員
 */
export async function requireMember(userId: number, tripId: number | string): Promise<void> {
  const isUserMember = await isMember(userId, tripId);
  if (!isUserMember) {
    throw new Error('Forbidden: Trip member required');
  }
}
