'use server';

import { dbConnect } from '@/lib/mongodb';
import { Trip, ItineraryDay } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { LocalizedNames } from '@/types';
import { tripOverlapsRange } from '@/lib/dateRange';
import { logger } from '@/lib/logger';

/**
 * 旅行地圖熱點的一個地點：座標 + 權重（= 在該地的行程日次數）。
 * 多語地名保留，供前端依語系顯示 tooltip。
 */
export interface VisitedPlace {
  lat: number;
  lon: number;
  name: string;
  names?: LocalizedNames;
  countryCode?: string;
  /** 造訪比重：所有旅程中、地點落在此座標的行程日數量。 */
  weight: number;
}

type AggRow = {
  lat: number;
  lon: number;
  name?: string;
  names?: LocalizedNames;
  countryCode?: string;
  weight: number;
};

/**
 * 匯總目前使用者所有旅程的「行程日地點」，依座標（四捨五入到小數兩位，約 ~1km）
 * 分群、以出現次數為權重，供旅行地圖畫熱力圖。無地點的行程日不計入。
 *
 * 行程日本身沒有日期，故 `year` 篩選改以「所屬旅程的起訖日是否與該年重疊」為準，
 * 與航線的年份篩選共用同一套判斷（src/lib/dateRange.ts），兩種模式行為一致。
 *
 * 一次 aggregate 完成（先取使用者旅程 id，再對 ItineraryDay 分群），不 N+1。
 */
export const getVisitedPlaces = withAuth(
  async (session, options?: { year?: number | null }): Promise<ActionResult<VisitedPlace[]>> => {
    try {
      await dbConnect();

      const year = options?.year ?? null;
      const trips = await Trip.find({ 'members.user': session.userId })
        .select('_id startDate endDate')
        .lean<{ _id: unknown; startDate?: Date | null; endDate?: Date | null }[]>();
      if (trips.length === 0) return { success: true, data: [] };

      // 年份篩選：只保留起訖日與該年（1/1–12/31）重疊的旅程。
      const selected =
        year === null
          ? trips
          : trips.filter((t) =>
              tripOverlapsRange(
                t.startDate ?? null,
                t.endDate ?? null,
                new Date(year, 0, 1),
                new Date(year, 11, 31, 23, 59, 59, 999)
              )
            );
      if (selected.length === 0) return { success: true, data: [] };

      const tripIds = selected.map((t) => t._id);

      const rows = await ItineraryDay.aggregate<AggRow>([
        {
          $match: {
            trip: { $in: tripIds },
            'location.lat': { $type: 'number' },
            'location.lon': { $type: 'number' },
          },
        },
        {
          $group: {
            _id: {
              lat: { $round: ['$location.lat', 2] },
              lon: { $round: ['$location.lon', 2] },
            },
            weight: { $sum: 1 },
            lat: { $first: '$location.lat' },
            lon: { $first: '$location.lon' },
            name: { $first: '$location.name' },
            names: { $first: '$location.names' },
            countryCode: { $first: '$location.country_code' },
          },
        },
        { $project: { _id: 0 } },
      ]);

      const places: VisitedPlace[] = rows.map((r) => ({
        lat: r.lat,
        lon: r.lon,
        name: r.name || '',
        names: r.names,
        countryCode: r.countryCode,
        weight: r.weight,
      }));

      return { success: true, data: places };
    } catch (error) {
      logger.error('Get visited places error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
