'use server';

import { dbConnect } from '@/lib/mongodb';
import { Notification } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { NotificationItem } from '@/types';
import { logger } from '@/lib/logger';
import { toNotificationDto, type NotificationDtoInput } from '@/lib/dto';

/** 收件匣一次最多回傳幾則（足夠鈴鐺面板使用，不做游標分頁）。 */
const MAX_NOTIFICATIONS = 30;

/**
 * 通知為 **per-user 收件匣**（跨旅程的個人視角，比照 getStats），故不走
 * getTripMembership——只認 session.userId，授權即「只能讀寫自己的通知」。
 */

/**
 * 取得目前使用者最近的通知（新到舊，上限 {@link MAX_NOTIFICATIONS}）。
 */
export const getNotifications = withAuth(
  async (session): Promise<ActionResult<NotificationItem[]>> => {
    try {
      await dbConnect();
      const docs = await Notification.find({ user: session.userId })
        .sort({ createdAt: -1 })
        .limit(MAX_NOTIFICATIONS)
        .lean<NotificationDtoInput[]>();
      return { success: true, data: docs.map(toNotificationDto) };
    } catch (error) {
      logger.error('Get notifications error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 取得目前使用者的未讀通知數（鈴鐺 badge 用；輕量 count 查詢，可頻繁輪詢）。
 */
export const getUnreadNotificationCount = withAuth(
  async (session): Promise<ActionResult<{ count: number }>> => {
    try {
      await dbConnect();
      const count = await Notification.countDocuments({ user: session.userId, read: false });
      return { success: true, data: { count } };
    } catch (error) {
      logger.error('Get unread notification count error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 標記單一通知為已讀。以 `{ _id, user }` 限定，故無法標記他人的通知。
 */
export const markNotificationRead = withAuth(
  async (session, notificationId: string): Promise<ActionResult<{ message: string }>> => {
    try {
      await dbConnect();
      await Notification.updateOne(
        { _id: notificationId, user: session.userId },
        { $set: { read: true } }
      );
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Mark notification read error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 一次將目前使用者所有未讀通知標記為已讀。
 */
export const markAllNotificationsRead = withAuth(
  async (session): Promise<ActionResult<{ message: string }>> => {
    try {
      await dbConnect();
      await Notification.updateMany(
        { user: session.userId, read: false },
        { $set: { read: true } }
      );
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Mark all notifications read error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
