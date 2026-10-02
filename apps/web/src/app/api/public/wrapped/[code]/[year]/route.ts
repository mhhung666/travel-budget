import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { User, Trip, ItineraryDay } from '@/models';
import { isValidHashCode } from '@/lib/hashcode';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { computeYearInReview, availableReviewYears } from '@/lib/yearInReview';
import { logger } from '@/lib/logger';
import type { Location } from '@/types';

/**
 * 公開（不需登入）年度旅行回顧分享資料。
 *
 * 與公開地圖路由共用 `mapShareCode`，並**沿用同一套去識別化契約**：只回傳「地理」
 * 彙總數字（趟數 / 國家 / 城市）與年份，**不含私人飛行紀錄、飛行里程、任何金額、
 * 分類、旅伴、旅行名稱、id 或完整日期**。
 *
 * 分享為 opt-in；未產生分享碼者（或碼已撤銷）、年份格式不符一律回 404。
 */

interface PublicYearInReview {
  year: number;
  tripCount: number;
  countryCount: number;
  cityCount: number;
  /** 有資料的年份（新到舊），供公開頁年份切換。 */
  availableYears: number[];
}

type LeanTrip = {
  _id: Types.ObjectId;
  startDate?: Date | null;
  endDate?: Date | null;
  destinationLocation?: Location | null;
};
type LeanDay = { trip: Types.ObjectId; location?: Location | null };

const toYmd = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

const toPoint = (loc: Location | null | undefined) =>
  loc && typeof loc.lat === 'number' && typeof loc.lon === 'number'
    ? { lat: loc.lat, lon: loc.lon, countryCode: loc.country_code }
    : null;

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string; year: string }> }
) {
  try {
    const { code, year: yearParam } = await context.params;
    if (!isValidHashCode(code)) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }
    // 年份須為合理整數（避免無意義輸入打進計算）。
    const year = Number(yearParam);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isInteger(year) || year < 2000 || year > maxYear) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    await dbConnect();

    const user = await User.findOne({ mapShareCode: code })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (!user) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    // 去識別化：只撈地理（旅程起訖 + 目的地 + 行程日地點），**不撈任何支出**。
    const trips = await Trip.find({ 'members.user': user._id })
      .select('startDate endDate destinationLocation')
      .lean<LeanTrip[]>();

    const tripIds = trips.map((t) => t._id);
    const days =
      tripIds.length > 0
        ? await ItineraryDay.find({ trip: { $in: tripIds } })
            .select('trip location')
            .lean<LeanDay[]>()
        : [];

    // 比照登入 action 投影成純函式輸入，但 memberIds / expenses 留空（不計旅伴/花費）。
    const reviewTrips = trips.map((t) => ({
      id: t._id.toString(),
      startDate: toYmd(t.startDate),
      endDate: toYmd(t.endDate),
      destination: toPoint(t.destinationLocation),
      memberIds: [] as string[],
    }));
    const reviewPlaces = days
      .map((d) => {
        const p = toPoint(d.location);
        return p ? { tripId: d.trip.toString(), ...p } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const review = computeYearInReview(
      { trips: reviewTrips, itinerary: reviewPlaces, expenses: [], selfUserId: '' },
      year
    );

    // 只挑地理欄位外流（其餘如 totalSpend/topCategory/companionCount 一律不回傳）。
    const payload: PublicYearInReview = {
      year,
      tripCount: review.tripCount,
      countryCount: review.countryCount,
      cityCount: review.cityCount,
      // 刻意不帶成就紀錄年份（第三參數）：公開 payload 白名單不含成就區塊，
      // 只有回填紀錄的年份在公開頁會是整張白卡（P3 評估結論：登入版才納入）。
      availableYears: availableReviewYears(reviewTrips, []),
    };
    return NextResponse.json(payload);
  } catch (error) {
    logger.error('Get public year in review error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
