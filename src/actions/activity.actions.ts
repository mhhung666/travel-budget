'use server';

import { dbConnect } from '@/lib/mongodb';
import { ActivityLog } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { ActivityLogItem } from '@/types';
import { logger } from '@/lib/logger';
import { toActivityLogDto, type ActivityLogDtoInput } from '@/lib/dto';

/** 動態牆一次最多回傳幾筆（足夠呈現近期動態，不做游標分頁）。 */
const MAX_ACTIVITY = 50;

/**
 * 取得某旅程的動態牆（活動紀錄，新到舊，上限 {@link MAX_ACTIVITY}）。
 *
 * 動態牆是**旅程層級的共享**資料（非 per-user 收件匣），故走 getTripMembership
 * 授權——任何成員可檢視全團活動。
 */
export const getActivityLog = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<ActivityLogItem[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();
      const docs = await ActivityLog.find({ trip: membership.tripId })
        .sort({ createdAt: -1 })
        .limit(MAX_ACTIVITY)
        .lean<ActivityLogDtoInput[]>();
      return { success: true, data: docs.map(toActivityLogDto) };
    } catch (error) {
      logger.error('Get activity log error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
