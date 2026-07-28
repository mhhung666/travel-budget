'use server';

import { Types, type PipelineStage } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, ItineraryDay, Photo } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { LocalizedNames, TripPhoto } from '@/types';
import { tripOverlapsRange } from '@/lib/dateRange';
import { presignGetStable } from '@/lib/storage';
import { toTripPhotoDto, type TripPhotoDtoInput } from '@/lib/dto';
import { logger } from '@/lib/logger';

/** 旅行地圖熱點的一個地點：座標 + 造訪次數。多語地名保留，供前端依語系顯示。 */
export interface VisitedPlace {
  lat: number;
  lon: number;
  name: string;
  names?: LocalizedNames;
  countryCode?: string;
  /** 此座標出現在行程日的次數。 */
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

      const pipeline: PipelineStage[] = [
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
      ];

      const rows = await ItineraryDay.aggregate<AggRow>(pipeline);

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

/**
 * 地圖相片圖層的一張相片（ROADMAP #21 Phase 3）：來自旅程相簿（Photo collection），
 * 座標取自相片自己的 EXIF GPS（退關聯行程日 → 手動拉釘，由 `location.source` 標示）。
 *
 * **取代**了舊的收據衍生模式——收據是憑證不是回憶，且座標只能借整天共用的行程日中心。
 * 相片仍私有：`url`／`thumb_url` 由 `presignGetStable` 批次簽發（窗口內逐字元穩定，SW 的
 * CacheFirst 才命中），絕不供公開分享路由使用。
 *
 * `name`／`names`／`countryCode` 是**顯示標籤**，取自關聯行程日的地點（相片自己的反查
 * 地名 `place` 仍留待日後離線批次回填，見 models/Photo.ts）；純 EXIF、未關聯行程日的
 * 相片沒有標籤（`name` 為空字串），座標照樣精確釘點。
 */
export interface MapPhoto extends TripPhoto {
  /** 所屬旅程 hash_code，供前端連回旅程。 */
  tripHashCode: string;
  /** 顯示標籤：關聯行程日的地名（可能為空）。 */
  name: string;
  names?: LocalizedNames;
  countryCode?: string;
}

/**
 * 匯總目前使用者所有旅程中「有座標」的相簿相片，供地圖相片圖層依 EXIF GPS 精確釘點。
 * 座標來源見 `Photo.location.source`；前端依座標分群、近點交給 marker cluster
 * （不再做 ~1km 去重，那會把整條街的相片誤併成一張）。年份篩選同熱點／航線（旅程起訖
 * 與該年重疊）。
 *
 * URL 在此就用 `presignGetStable` 批次簽好隨 DTO 一起回（比照 getTripPhotos）：一次幾百張
 * 只是純 HMAC 計算、沒有網路往返，成本可忽略；逐張再打 action 反而是 N+1。顯示標籤取自
 * 關聯行程日的地點，一次撈齊涉及的行程日避免 N+1。
 */
export const getMapPhotos = withAuth(
  async (session, options?: { year?: number | null }): Promise<ActionResult<MapPhoto[]>> => {
    try {
      await dbConnect();

      const year = options?.year ?? null;
      const trips = await Trip.find({ 'members.user': session.userId })
        .select('_id hashCode startDate endDate')
        .lean<
          {
            _id: Types.ObjectId;
            hashCode?: string;
            startDate?: Date | null;
            endDate?: Date | null;
          }[]
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

      // 只取有座標的相片（location 由 EXIF／行程日／手動而來，見 Photo model）。
      // location 子文件的 lat／lon 為 required，故 `$ne: null` 即等於「有座標」。
      const photos = await Photo.find({
        trip: { $in: tripIds },
        location: { $ne: null },
      })
        .sort({ takenAt: -1, createdAt: -1 })
        .lean<(TripPhotoDtoInput & { key: string; thumbKey: string; itineraryDay?: unknown })[]>();
      if (photos.length === 0) return { success: true, data: [] };

      // 顯示標籤取自關聯行程日的地點（相片自己的反查地名 place 仍待日後回填）。
      // 一次撈齊涉及的行程日，避免 N+1；trip 條件確保只讀本人旅程的行程日。
      const dayIds = [
        ...new Set(
          photos
            .map((p) => p.itineraryDay)
            .filter(Boolean)
            .map(String)
        ),
      ];
      const days = dayIds.length
        ? await ItineraryDay.find({ _id: { $in: dayIds }, trip: { $in: tripIds } })
            .select('location')
            .lean<
              {
                _id: unknown;
                location?: { name?: string; names?: LocalizedNames; country_code?: string } | null;
              }[]
            >()
        : [];
      const labelByDay = new Map(days.map((d) => [String(d._id), d.location ?? null]));

      const data = await Promise.all(
        photos.map(async (p) => {
          const [url, thumbUrl] = await Promise.all([
            presignGetStable('receipts', p.key),
            presignGetStable('receipts', p.thumbKey),
          ]);
          const dto = toTripPhotoDto(p, { url, thumbUrl });
          const label = p.itineraryDay ? labelByDay.get(String(p.itineraryDay)) : null;
          return {
            ...dto,
            tripHashCode: hashByTrip.get(dto.trip_id) ?? '',
            name: label?.name ?? '',
            names: label?.names,
            countryCode: label?.country_code,
          } satisfies MapPhoto;
        })
      );

      return { success: true, data };
    } catch (error) {
      logger.error('Get map photos error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
