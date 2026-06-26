'use server';

import { revalidatePath } from 'next/cache';
import { Trip as TripModel, type TripDoc } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { setBudgetSchema, type SetBudgetInput } from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Trip } from '@/types';
import { logger } from '@/lib/logger';
import { toTripDto } from '@/lib/dto';

type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/**
 * 設定 / 更新旅程預算（admin only）。
 *
 * 預算進度（預算 vs 實際）刻意不在後端計算：旅程詳情頁本就載入了 trip（含 budget）
 * 與全部支出，於前端以 lib/budget.ts `computeBudgetProgress` 即時算出即可，省一次往返。
 * 本 action 只負責「寫入」預算設定。
 *
 * 正規化規則：
 * - total <= 0 或未提供 → 視為未設總額（null）。
 * - 分類預算僅保留金額 > 0 者（金額 0/空白等同「不設此分類」）。
 * - 若總額與分類皆為空 → 整個 budget 設為 null（回到「尚未設定」狀態）。
 */
export const setTripBudget = withAuth(
  async (session, tripIdOrCode: string, input: SetBudgetInput): Promise<ActionResult<Trip>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validation = setBudgetSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { total, categories } = validation.data;

      const normalizedTotal = total != null && total > 0 ? total : null;
      // 同一分類若重複，後者覆蓋前者；僅保留金額 > 0 者
      const byCategory = new Map<string, number>();
      for (const c of categories ?? []) {
        if (c.amount > 0) byCategory.set(c.category, c.amount);
      }
      const normalizedCategories = Array.from(byCategory, ([category, amount]) => ({
        category,
        amount,
      }));

      const budget =
        normalizedTotal === null && normalizedCategories.length === 0
          ? null
          : { total: normalizedTotal, categories: normalizedCategories };

      const trip = await TripModel.findByIdAndUpdate(
        membership.tripId,
        { $set: { budget } },
        { new: true }
      ).lean<LeanTrip>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      logger.error('Set trip budget error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
