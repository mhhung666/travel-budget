/**
 * 權限檢查工具函數
 * 用於驗證用戶在旅行中的權限
 */

import { supabase } from '@/lib/supabase';

export type MembershipResult = {
  tripId: number;
  role: TripRole;
};

/**
 * 將 getTripId + isMember/isAdmin 合併為一次 DB 查詢。
 * hash_code 情況下省掉一個 round trip。
 */
export async function getTripMembership(
  userId: number,
  tripIdOrCode: string
): Promise<MembershipResult | null> {
  // 純數字 — trip_id 已知，直接查 trip_members
  if (/^\d+$/.test(tripIdOrCode)) {
    const tripId = parseInt(tripIdOrCode, 10);
    const { data, error } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return { tripId, role: data.role as TripRole };
  }

  // hash_code — 用 inner join 一次同時解析 ID 並驗證身份
  const { data, error } = await supabase
    .from('trip_members')
    .select('role, trips!inner(id)')
    .eq('trips.hash_code', tripIdOrCode)
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  const tripsData = data as unknown as { role: string; trips: { id: number } | { id: number }[] };
  const trips = Array.isArray(tripsData.trips) ? tripsData.trips[0] : tripsData.trips;
  return { tripId: trips.id, role: tripsData.role as TripRole };
}

export type TripRole = 'admin' | 'member';

/**
 * 檢查用戶是否為旅行的管理員
 * @param userId 用戶 ID
 * @param tripId 旅行 ID (可以是數字 ID 或 hash_code)
 * @returns 是否為管理員
 */
export async function isAdmin(userId: number, tripId: number | string, resolvedTripId?: number): Promise<boolean> {
  try {
    // 使用已解析的 tripId，或自行解析
    const actualTripId = resolvedTripId ?? await getTripId(tripId);
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
export async function isMember(userId: number, tripId: number | string, resolvedTripId?: number): Promise<boolean> {
  try {
    const actualTripId = resolvedTripId ?? await getTripId(tripId);
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
export async function requireAdmin(userId: number, tripId: number | string, resolvedTripId?: number): Promise<void> {
  const isUserAdmin = await isAdmin(userId, tripId, resolvedTripId);
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
export async function requireMember(userId: number, tripId: number | string, resolvedTripId?: number): Promise<void> {
  const isUserMember = await isMember(userId, tripId, resolvedTripId);
  if (!isUserMember) {
    throw new Error('Forbidden: Trip member required');
  }
}
