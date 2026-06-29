'use server';

import type { PipelineStage } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, ItineraryDay } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { LocalizedNames } from '@/types';
import { tripOverlapsRange } from '@/lib/dateRange';
import { logger } from '@/lib/logger';

/**
 * 旅行地圖熱點的一個地點：座標 + 權重。多語地名保留，供前端依語系顯示 tooltip。
 * weight 的語意依查詢的 weightBy 而定：'visits'＝該座標的行程日數量；
 * 'spend'＝關聯到這些行程日的支出總額（基準幣 TWD，連動 Phase 2 的 Expense.itineraryDays；
 * 跨多日的支出平均分攤到各天）。
 */
export interface VisitedPlace {
  lat: number;
  lon: number;
  name: string;
  names?: LocalizedNames;
  countryCode?: string;
  /** 權重；語意見上（造訪次數或花費總額）。 */
  weight: number;
}

/** 熱點權重依據：造訪次數（預設）或花費總額。 */
export type HeatWeightBy = 'visits' | 'spend';

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
  async (
    session,
    options?: { year?: number | null; weightBy?: HeatWeightBy }
  ): Promise<ActionResult<VisitedPlace[]>> => {
    try {
      await dbConnect();

      const year = options?.year ?? null;
      const weightBy: HeatWeightBy = options?.weightBy ?? 'visits';
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

      // weightBy='spend' 時 $lookup 關聯到此行程日的支出、加總金額作為權重（連動 Phase 2）；
      // 'visits' 時權重為該座標的行程日數量。其餘分群/去重邏輯一致。
      const spend = weightBy === 'spend';
      const pipeline: PipelineStage[] = [
        {
          $match: {
            trip: { $in: tripIds },
            'location.lat': { $type: 'number' },
            'location.lon': { $type: 'number' },
          },
        },
      ];
      if (spend) {
        pipeline.push(
          {
            $lookup: {
              from: 'expenses',
              localField: '_id',
              foreignField: 'itineraryDays',
              as: '_exp',
            },
          },
          // 支出可關聯多個行程日；金額平均分攤到各天（比照每日花費聚合），避免跨日支出
          // 在每個關聯地點重複計入全額。
          {
            $addFields: {
              _spend: {
                $sum: {
                  $map: {
                    input: '$_exp',
                    as: 'e',
                    in: { $divide: ['$$e.amount', { $max: [{ $size: '$$e.itineraryDays' }, 1] }] },
                  },
                },
              },
            },
          }
        );
      }
      pipeline.push(
        {
          $group: {
            _id: {
              lat: { $round: ['$location.lat', 2] },
              lon: { $round: ['$location.lon', 2] },
            },
            weight: spend ? { $sum: '$_spend' } : { $sum: 1 },
            lat: { $first: '$location.lat' },
            lon: { $first: '$location.lon' },
            name: { $first: '$location.name' },
            names: { $first: '$location.names' },
            countryCode: { $first: '$location.country_code' },
          },
        },
        { $project: { _id: 0 } }
      );

      const rows = await ItineraryDay.aggregate<AggRow>(pipeline);

      const places: VisitedPlace[] = rows
        // 花費模式：丟掉沒有任何關聯支出（權重 0）的地點，熱點才有意義。
        .filter((r) => !spend || r.weight > 0)
        .map((r) => ({
          lat: r.lat,
          lon: r.lon,
          name: r.name || '',
          names: r.names,
          countryCode: r.countryCode,
          weight: spend ? Math.round(r.weight) : r.weight,
        }));

      return { success: true, data: places };
    } catch (error) {
      logger.error('Get visited places error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
