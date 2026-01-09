/**
 * Hash Code 生成與驗證工具
 * 用於生成短 hash code 供旅行分享使用
 */

/**
 * 生成隨機短 hash code
 * @param length hash code 長度 (預設 6)
 * @returns 隨機生成的 hash code (例如: a7x9k2)
 */
export function generateHashCode(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars.charAt(randomIndex);
  }

  return result;
}

/**
 * 驗證 hash code 格式是否正確
 * @param hashCode 要驗證的 hash code
 * @returns 是否為有效格式
 */
export function isValidHashCode(hashCode: string): boolean {
  // hash code 應為 6-8 位小寫字母或數字
  const regex = /^[a-z0-9]{6,8}$/;
  return regex.test(hashCode);
}

/**
 * 生成唯一的 hash code (需配合數據庫檢查)
 * 此函數會嘗試多次生成,直到找到唯一的 hash code
 *
 * @param checkExists 檢查 hash code 是否已存在的函數
 * @param maxAttempts 最大嘗試次數 (預設 10)
 * @returns 唯一的 hash code
 * @throws 如果超過最大嘗試次數仍無法生成唯一 hash code
 */
export async function generateUniqueHashCode(
  checkExists: (hashCode: string) => Promise<boolean>,
  maxAttempts: number = 10
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const hashCode = generateHashCode();
    const exists = await checkExists(hashCode);

    if (!exists) {
      return hashCode;
    }
  }

  // 如果嘗試多次仍碰撞,增加長度重試
  for (let i = 0; i < maxAttempts; i++) {
    const hashCode = generateHashCode(8); // 使用更長的 hash code
    const exists = await checkExists(hashCode);

    if (!exists) {
      return hashCode;
    }
  }

  throw new Error('Unable to generate unique hash code after maximum attempts');
}

/**
 * 為測試環境生成可預測的 hash code
 * @param seed 種子字串
 * @returns 基於種子生成的 hash code
 */
export function generateTestHashCode(seed: string): string {
  // 簡單的雜湊函數,用於測試
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  let absHash = Math.abs(hash);

  for (let i = 0; i < 6; i++) {
    result += chars[absHash % chars.length];
    absHash = Math.floor(absHash / chars.length);
  }

  return result;
}
