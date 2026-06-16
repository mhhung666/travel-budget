/**
 * 權限檢查工具函數
 * 用於驗證用戶在旅行中的權限
 */

import { isValidObjectId } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip } from '@/models';

export type TripRole = 'admin' | 'member';

export type MembershipResult = {
  tripId: string;
  role: TripRole;
};

/**
 * 依 tripId（ObjectId）或 hash_code 建立查詢條件。
 * hash_code 為 6-10 碼小寫英數，永遠不會是合法的 12-byte / 24-hex ObjectId，分流無歧義。
 */
function tripQuery(tripIdOrCode: string) {
  return isValidObjectId(tripIdOrCode) ? { _id: tripIdOrCode } : { hashCode: tripIdOrCode };
}

/**
 * 一次查詢同時「解析旅程 ID + 驗證成員身分 + 取得角色」。
 * members 已內嵌於 trip 文件，因此只需讀一份文件。
 */
export async function getTripMembership(
  userId: string,
  tripIdOrCode: string
): Promise<MembershipResult | null> {
  await dbConnect();

  const trip = await Trip.findOne(tripQuery(tripIdOrCode)).select('_id members').lean();
  if (!trip) return null;

  const member = trip.members.find((m) => m.user.toString() === userId);
  if (!member) return null;

  return { tripId: trip._id.toString(), role: member.role as TripRole };
}

/**
 * 檢查用戶是否為旅行的管理員
 */
export async function isAdmin(userId: string, tripIdOrCode: string): Promise<boolean> {
  const membership = await getTripMembership(userId, tripIdOrCode);
  return membership?.role === 'admin';
}

/**
 * 檢查用戶是否為旅行成員
 */
export async function isMember(userId: string, tripIdOrCode: string): Promise<boolean> {
  return (await getTripMembership(userId, tripIdOrCode)) !== null;
}

/**
 * 取得用戶在旅行中的角色
 */
export async function getUserRole(
  userId: string,
  tripIdOrCode: string
): Promise<TripRole | null> {
  const membership = await getTripMembership(userId, tripIdOrCode);
  return membership?.role ?? null;
}

/**
 * 將 tripId（可能是 hash_code）解析為實際的 trip _id 字串。
 * @returns trip _id 字串，或不存在時回傳 null
 */
export async function getTripId(tripIdOrCode: string): Promise<string | null> {
  await dbConnect();

  const trip = await Trip.findOne(tripQuery(tripIdOrCode)).select('_id').lean();
  return trip ? trip._id.toString() : null;
}

/**
 * 公開分享端點專用：僅以 hash_code 解析旅程，**拒絕 ObjectId**。
 *
 * 為什麼？`/api/public/*` 是「知道 hash_code 即可檢視」的分享面。hash_code 是
 * 設計上的能力憑證（不可預測的隨機短碼）；ObjectId 則含可預測的時間戳前綴、且
 * 會出現在各種回應的 `id` 欄位中。若公開端點也接受 ObjectId，等於開了一條繞過
 * hash_code 的旁路。此函式確保「分享能力 == 知道 hash_code」。
 *
 * hash_code 為 6-10 碼小寫英數，永遠不是合法的 12-byte / 24-hex ObjectId，故以 `isValidObjectId`
 * 即可明確分流並拒絕 ObjectId 形式的輸入。
 *
 * @returns trip _id 字串；輸入為 ObjectId 形式或查無此 hash_code 時回傳 null
 */
export async function getTripIdByHashCode(hashCode: string): Promise<string | null> {
  await dbConnect();

  // 明確拒絕 ObjectId：公開端點只認 hash_code。
  if (isValidObjectId(hashCode)) return null;

  const trip = await Trip.findOne({ hashCode }).select('_id').lean();
  return trip ? trip._id.toString() : null;
}

/**
 * 取得旅行的 hash_code
 */
export async function getTripHashCode(tripId: string): Promise<string | null> {
  await dbConnect();

  const trip = await Trip.findById(tripId).select('hashCode').lean();
  return trip ? trip.hashCode : null;
}

/**
 * 驗證並拋出錯誤（用於 API routes）
 * @throws 如果用戶不是管理員
 */
export async function requireAdmin(userId: string, tripIdOrCode: string): Promise<void> {
  if (!(await isAdmin(userId, tripIdOrCode))) {
    throw new Error('Forbidden: Admin role required');
  }
}

/**
 * 驗證並拋出錯誤（用於 API routes）
 * @throws 如果用戶不是成員
 */
export async function requireMember(userId: string, tripIdOrCode: string): Promise<void> {
  if (!(await isMember(userId, tripIdOrCode))) {
    throw new Error('Forbidden: Trip member required');
  }
}
