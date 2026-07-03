'use server';

import type { PipelineStage } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, ItineraryDay, Expense } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { LocalizedNames } from '@/types';
import { tripOverlapsRange } from '@/lib/dateRange';
import { RECEIPT_CONTENT_TYPES } from '@/lib/uploads';
import { logger } from '@/lib/logger';

/** 相片釘點只收圖片附件（PDF 收據不上圖）。 */
const IMAGE_CONTENT_TYPES = RECEIPT_CONTENT_TYPES.filter((t) => t.startsWith('image/'));

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

/**
 * 地圖相片釘點的一張相片（ROADMAP #16）：支出收據的圖片附件，經由該支出所關聯的
 * 行程日（Expense.itineraryDays → ItineraryDay.location）取得座標後釘上地圖。
 *
 * 只帶物件 key（不含可直接存取的 URL）——檢視時前端逐張呼叫 getReceiptUrl 驗成員後
 * 取短效簽名 URL，維持收據「私有」契約（不把簽名 URL 一次全簽發、也不外洩到公開分享）。
 * tripHashCode 供前端連回旅程；name/names 供依語系顯示地名。
 */
export interface MapPhoto {
  /** R2 物件 key（同時作為前端識別 id）。 */
  key: string;
  contentType: string;
  /** 所屬旅程 ObjectId 字串，供 getReceiptUrl 驗成員。 */
  tripId: string;
  tripHashCode: string;
  /** 支出描述，作為相片說明。 */
  description: string;
  /** 支出日期（ISO 字串）。 */
  date: string;
  lat: number;
  lon: number;
  name: string;
  names?: LocalizedNames;
  countryCode?: string;
}

type PhotoAggRow = {
  key: string;
  contentType: string;
  trip: unknown;
  description?: string;
  date?: Date | null;
  lat: number;
  lon: number;
  name?: string;
  names?: LocalizedNames;
  countryCode?: string;
};

/**
 * 匯總目前使用者所有旅程中「有圖片附件、且關聯到含座標行程日」的支出收據，投影成可釘上
 * 地圖的相片點。位置取自關聯行程日的 location；支出關聯多天時，於每個不同座標各釘一次
 * （同 key 同座標去重，避免同一張相片在同地點重複）。年份篩選同熱點/航線（旅程起訖與該年重疊）。
 *
 * 一次 aggregate 完成（$lookup 關聯行程日 → 展開附件），不 N+1。收據仍私有：此處只回 key，
 * 不簽 URL，也不供公開分享路由使用。
 */
export const getMapPhotos = withAuth(
  async (session, options?: { year?: number | null }): Promise<ActionResult<MapPhoto[]>> => {
    try {
      await dbConnect();

      const year = options?.year ?? null;
      const trips = await Trip.find({ 'members.user': session.userId })
        .select('_id hashCode startDate endDate')
        .lean<
          { _id: unknown; hashCode?: string; startDate?: Date | null; endDate?: Date | null }[]
        >();
      if (trips.length === 0) return { success: true, data: [] };

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

      const hashByTrip = new Map<string, string>(
        selected.map((t) => [String(t._id), t.hashCode ?? ''])
      );
      const tripIds = selected.map((t) => t._id);

      const rows = await Expense.aggregate<PhotoAggRow>([
        {
          $match: {
            trip: { $in: tripIds },
            'attachments.0': { $exists: true },
            'itineraryDays.0': { $exists: true },
          },
        },
        // 關聯行程日以取得座標（同 getVisitedPlaces：ItineraryDay 集合名為小寫複數）。
        {
          $lookup: {
            from: 'itinerarydays',
            localField: 'itineraryDays',
            foreignField: '_id',
            as: '_days',
          },
        },
        { $unwind: '$_days' },
        {
          $match: {
            '_days.location.lat': { $type: 'number' },
            '_days.location.lon': { $type: 'number' },
          },
        },
        { $unwind: '$attachments' },
        { $match: { 'attachments.contentType': { $in: IMAGE_CONTENT_TYPES } } },
        {
          $project: {
            _id: 0,
            key: '$attachments.key',
            contentType: '$attachments.contentType',
            trip: '$trip',
            description: '$description',
            date: '$date',
            lat: '$_days.location.lat',
            lon: '$_days.location.lon',
            name: '$_days.location.name',
            names: '$_days.location.names',
            countryCode: '$_days.location.country_code',
          },
        },
      ]);

      // 同 key 同座標（四捨五入到 ~1km）去重：跨多天但落在同地點的同一張相片只留一份。
      const seen = new Set<string>();
      const photos: MapPhoto[] = [];
      for (const r of rows) {
        const dedupe = `${r.key}@${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        photos.push({
          key: r.key,
          contentType: r.contentType,
          tripId: String(r.trip),
          tripHashCode: hashByTrip.get(String(r.trip)) ?? '',
          description: r.description ?? '',
          date: r.date ? new Date(r.date).toISOString() : '',
          lat: r.lat,
          lon: r.lon,
          name: r.name || '',
          names: r.names,
          countryCode: r.countryCode,
        });
      }

      return { success: true, data: photos };
    } catch (error) {
      logger.error('Get map photos error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
