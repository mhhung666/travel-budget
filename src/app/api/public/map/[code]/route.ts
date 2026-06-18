import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { User, Trip, ItineraryDay } from '@/models';
import { isValidHashCode } from '@/lib/hashcode';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { logger } from '@/lib/logger';
import type { Location, LocalizedNames } from '@/types';

/**
 * 公開（不需登入）旅行地圖分享資料。
 *
 * 以使用者的 `mapShareCode` 反查其所有旅程，回傳「去識別化」的路線：只含
 * 出發地 / 目的地的座標與多語地名，**不含旅行名稱、日期、id 或任何可連回單筆
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

interface PublicRoute {
  /** 合成序號（僅供前端 React key 與選取，與真正的旅行 id 無關）。 */
  id: string;
  departure: PublicGeoPoint | null;
  destination: PublicGeoPoint;
}

type LeanTrip = {
  departureLocation?: Location | null;
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
      .select('_id departureLocation destinationLocation startDate endDate')
      .lean<(LeanTrip & { _id: Types.ObjectId })[]>();

    const routes: PublicRoute[] = trips
      .map((trip) => ({
        departure: toPoint(trip.departureLocation),
        destination: toPoint(trip.destinationLocation),
        // 僅供伺服器端排序，不外流。
        _sort: trip.startDate ? new Date(trip.startDate).getTime() : Infinity,
      }))
      // 目的地座標是上圖的必要條件。
      .filter(
        (
          r
        ): r is { departure: PublicGeoPoint | null; destination: PublicGeoPoint; _sort: number } =>
          r.destination !== null
      )
      // 依出發日正序，讓箭頭讀作旅程先後順序；日期不外流（去識別化）。
      .sort((a, b) => a._sort - b._sort)
      .map((r, i) => ({ id: `r${i}`, departure: r.departure, destination: r.destination }));

    // 去識別化熱點：行程日地點依座標彙整，只回傳座標與權重（無地名）。
    const tripIds = trips.map((t) => t._id);
    const heatRows = await ItineraryDay.aggregate<{ lat: number; lon: number; weight: number }>([
      {
        $match: {
          trip: { $in: tripIds },
          'location.lat': { $type: 'number' },
          'location.lon': { $type: 'number' },
        },
      },
      {
        $group: {
          _id: { lat: { $round: ['$location.lat', 2] }, lon: { $round: ['$location.lon', 2] } },
          weight: { $sum: 1 },
          lat: { $first: '$location.lat' },
          lon: { $first: '$location.lon' },
        },
      },
      { $project: { _id: 0 } },
    ]);
    const heat = heatRows.map((h) => ({ lat: h.lat, lon: h.lon, weight: h.weight }));

    return NextResponse.json({ routes, heat });
  } catch (error) {
    logger.error('Get public map error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
