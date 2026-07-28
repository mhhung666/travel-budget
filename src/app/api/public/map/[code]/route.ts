import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { User, Trip, ItineraryDay } from '@/models';
import { isValidHashCode } from '@/lib/hashcode';
import { yearsSpanned } from '@/lib/dateRange';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { logger } from '@/lib/logger';
import type { Location, LocalizedNames } from '@/types';

/**
 * 公開（不需登入）旅行地圖分享資料。
 *
 * 以使用者的 `mapShareCode` 反查其所有旅程，回傳去識別化的目的地點位：
 * 只含目的地座標與多語地名，**不含旅行名稱、日期、id 或任何可連回單筆
 * 旅行的識別資訊**。地名為地理資訊（地圖本就會揭露地點），故保留以供顯示與選色。
 *
 * 分享為 opt-in；未產生分享碼者（或碼已撤銷）一律回 404。
 */

/** 去識別化的座標點：保留多語地名與國碼供前端依語系顯示與配色。 */
interface PublicGeoPoint {
  name: string;
  names?: LocalizedNames;
  lat: number;
  lon: number;
  countryCode?: string;
}

interface PublicDestination {
  /** 合成序號（僅供前端 React key 與選取，與真正的旅行 id 無關）。 */
  id: string;
  point: PublicGeoPoint;
  /** 此旅程涵蓋的年份（供年份篩選）。只露「年」、不露完整日期，仍維持去識別化。 */
  years: number[];
}

/** 去識別化熱點：座標 + 權重 + 年份（year=null 代表行程所屬旅程無日期）。 */
interface PublicHeatPoint {
  lat: number;
  lon: number;
  weight: number;
  year: number | null;
}

type LeanTrip = {
  destinationLocation?: Location | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

function toPoint(loc: Location | null | undefined): PublicGeoPoint | null {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  return {
    name: loc.name,
    names: loc.names,
    lat: loc.lat,
    lon: loc.lon,
    countryCode: loc.country_code,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    // 格式不符就視同不存在（避免把無效輸入打進 DB）。
    if (!isValidHashCode(code)) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    await dbConnect();

    const user = await User.findOne({ mapShareCode: code })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (!user) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    const trips = await Trip.find({ 'members.user': user._id })
      .select('_id destinationLocation startDate endDate')
      .lean<(LeanTrip & { _id: Types.ObjectId })[]>();

    const destinations: PublicDestination[] = trips
      .map((trip) => ({
        point: toPoint(trip.destinationLocation),
        years: yearsSpanned(trip.startDate, trip.endDate),
        // 僅供伺服器端排序，不外流。
        _sort: trip.startDate ? new Date(trip.startDate).getTime() : Infinity,
      }))
      // 目的地座標是上圖的必要條件。
      .filter(
        (
          r
        ): r is {
          point: PublicGeoPoint;
          years: number[];
          _sort: number;
        } => r.point !== null
      )
      // 依出發日正序，讓箭頭讀作旅程先後順序；日期不外流（去識別化）。
      .sort((a, b) => a._sort - b._sort)
      .map((r, i) => ({
        id: `r${i}`,
        point: r.point,
        years: r.years,
      }));

    // 每趟旅程涵蓋的年份（行程日本身無日期，年份篩選借用所屬旅程的年份）。
    const tripYears = new Map<string, number[]>();
    for (const t of trips) tripYears.set(String(t._id), yearsSpanned(t.startDate, t.endDate));

    // 去識別化熱點：行程日地點依「旅程 + 座標」彙整，再依旅程年份展開成 (座標, 年份) 列。
    // 跨年旅程的行程日會計入每個涵蓋年份（與主地圖的年份判斷一致）。
    const tripIds = trips.map((t) => t._id);
    const dayRows = await ItineraryDay.aggregate<{
      trip: Types.ObjectId;
      lat: number;
      lon: number;
      weight: number;
    }>([
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
            trip: '$trip',
            lat: { $round: ['$location.lat', 2] },
            lon: { $round: ['$location.lon', 2] },
          },
          weight: { $sum: 1 },
          trip: { $first: '$trip' },
          lat: { $first: '$location.lat' },
          lon: { $first: '$location.lon' },
        },
      },
      { $project: { _id: 0 } },
    ]);

    // 依 (座標, 年份) 彙總權重；無日期旅程歸到 year=null。
    const heatMap = new Map<string, PublicHeatPoint>();
    for (const row of dayRows) {
      const years = tripYears.get(String(row.trip)) ?? [];
      const buckets: (number | null)[] = years.length > 0 ? years : [null];
      for (const year of buckets) {
        const key = `${row.lat},${row.lon},${year}`;
        const existing = heatMap.get(key);
        if (existing) existing.weight += row.weight;
        else heatMap.set(key, { lat: row.lat, lon: row.lon, weight: row.weight, year });
      }
    }
    const heat = [...heatMap.values()];

    // 可篩選的年份清單（目的地 + 熱點的聯集），新到舊。
    const yearSet = new Set<number>();
    for (const destination of destinations) {
      for (const year of destination.years) yearSet.add(year);
    }
    for (const h of heat) if (h.year !== null) yearSet.add(h.year);
    const years = [...yearSet].sort((a, b) => b - a);

    return NextResponse.json({ destinations, heat, years });
  } catch (error) {
    logger.error('Get public map error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
