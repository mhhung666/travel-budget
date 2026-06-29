'use server';

import { headers } from 'next/headers';
import { dbConnect } from '@/lib/mongodb';
import { PushSubscription } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import { logger } from '@/lib/logger';
import { pushSubscriptionSchema } from '@/lib/validation';

/**
 * Web Push 訂閱管理（ROADMAP #9 Phase 3）。比照站內通知為 **per-user**：訂閱屬當前
 * session 的使用者，授權即「只能寫入/刪除自己的訂閱」（以 session.userId 綁定）。
 *
 * 推播本身的 opt-in 即「有沒有訂閱」——使用者在設定頁開啟推播 = savePushSubscription，
 * 關閉 = deletePushSubscription。故不另設 User 層的開關欄位。
 */

interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * 建立 / 更新當前使用者的一筆裝置推播訂閱（以 endpoint upsert 去重）。
 */
export const savePushSubscription = withAuth(
  async (session, input: PushSubscriptionInput): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = pushSubscriptionSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }
      const { endpoint, keys } = validation.data;

      // UA 僅供除錯/裝置辨識（非必填）；取不到不影響訂閱。
      let userAgent: string | undefined;
      try {
        userAgent = (await headers()).get('user-agent') ?? undefined;
      } catch {
        // 忽略：UA 非必要
      }

      await dbConnect();
      // 以 endpoint（唯一鍵）upsert：同裝置重複訂閱去重，並把 owner 綁到當前 session
      // （裝置易主時自動轉移所有權）。
      await PushSubscription.updateOne(
        { endpoint },
        { $set: { user: session.userId, endpoint, keys, userAgent } },
        { upsert: true }
      );
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Save push subscription error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 刪除當前使用者的一筆裝置訂閱（取消推播時呼叫）。以 `{ endpoint, user }` 限定，
 * 故無法刪除他人的訂閱。
 */
export const deletePushSubscription = withAuth(
  async (session, endpoint: string): Promise<ActionResult<{ message: string }>> => {
    try {
      await dbConnect();
      await PushSubscription.deleteOne({ endpoint, user: session.userId });
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Delete push subscription error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
