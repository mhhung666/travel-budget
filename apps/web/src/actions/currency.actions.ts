'use server';

import { revalidatePath } from 'next/cache';
import { type TripDoc } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { setCurrencySettingsSchema, type SetCurrencySettingsInput } from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Trip } from '@/types';
import { logger } from '@/lib/logger';
import { toTripDto } from '@/lib/dto';
import mongoose from 'mongoose';
import { setCurrencySettingsForActor } from '@/lib/currencySettings';
import { TripManagementError } from '@/lib/tripManagement';
import { TripWriteError } from '@/lib/tripWriteTransaction';

type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/**
 * 設定 / 更新旅程幣別設定（admin only）。
 *
 * 只影響「之後」的行為：支出表單的預設幣別與匯率預填、結算/統計的顯示幣別
 * 選項。既有支出保留寫入當下的 exchangeRate，刻意不追溯改寫。
 *
 * 正規化規則：
 * - 同一幣別重複時後者覆蓋前者；TWD 為基準幣，自訂匯率一律清為 null。
 * - 未提供 rate → null（用參考匯率）；非正數或非有限值拒絕。
 * - 預設幣別與常用清單皆空 → 整個 currencySettings 設為 null（回到「尚未設定」）。
 */
export const setTripCurrencySettings = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: SetCurrencySettingsInput
  ): Promise<ActionResult<Trip>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (membership.role !== 'admin') {
        return { success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' };
      }

      const validation = setCurrencySettingsSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const trip = await setCurrencySettingsForActor(
        mongoose.connection.db!,
        session.userId,
        membership.tripId,
        validation.data
      );

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      try {
        revalidatePath(`/trips/${tripIdOrCode}`);
      } catch (error) {
        logger.error('Currency settings revalidation failed', error);
      }
      return { success: true, data: toTripDto(trip as unknown as LeanTrip, session.userId) };
    } catch (error) {
      if (error instanceof TripManagementError)
        return { success: false, error: error.code, code: error.code };
      if (error instanceof TripWriteError)
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      logger.error('Set trip currency settings error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
