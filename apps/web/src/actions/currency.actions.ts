'use server';

import { revalidatePath } from 'next/cache';
import { Trip as TripModel, type TripDoc } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { setCurrencySettingsSchema, type SetCurrencySettingsInput } from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { Trip } from '@/types';
import { logger } from '@/lib/logger';
import { toTripDto } from '@/lib/dto';

type LeanTrip = TripDoc & { _id: { toString(): string }; createdAt: Date };

/**
 * 設定 / 更新旅程幣別設定（admin only）。
 *
 * 只影響「之後」的行為：支出表單的預設幣別與匯率預填、結算/統計的顯示幣別
 * 選項。既有支出保留寫入當下的 exchangeRate，刻意不追溯改寫。
 *
 * 正規化規則：
 * - 同一幣別重複時後者覆蓋前者；TWD 為基準幣，自訂匯率一律清為 null。
 * - rate <= 0 或未提供 → null（用即時匯率）。
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

      const { default_currency, currencies } = validation.data;

      const byCode = new Map<string, number | null>();
      for (const c of currencies ?? []) {
        byCode.set(c.code, c.code !== 'TWD' && c.rate != null && c.rate > 0 ? c.rate : null);
      }
      const normalizedCurrencies = Array.from(byCode, ([code, rate]) => ({ code, rate }));
      const normalizedDefault = default_currency ?? null;

      const currencySettings =
        normalizedDefault === null && normalizedCurrencies.length === 0
          ? null
          : { defaultCurrency: normalizedDefault, currencies: normalizedCurrencies };

      const trip = await TripModel.findByIdAndUpdate(
        membership.tripId,
        { $set: { currencySettings } },
        { new: true }
      ).lean<LeanTrip>();

      if (!trip) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}`);
      return { success: true, data: toTripDto(trip, session.userId) };
    } catch (error) {
      logger.error('Set trip currency settings error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
