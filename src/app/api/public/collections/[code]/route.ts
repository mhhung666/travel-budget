import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { User, Trip, ItineraryDay, FlightRecord, StayRecord } from '@/models';
import { isValidHashCode } from '@/lib/hashcode';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { computeBadgeCounts, type BadgeCounts } from '@/lib/badges';
import { logger } from '@/lib/logger';
import type { Location } from '@/types';

/**
 * 公開（不需登入）成就徽章分享資料（ROADMAP #19 P3）。
 *
 * 與公開地圖 / 年度回顧共用 `mapShareCode`，並沿用同一套去識別化契約——本路由**只回傳
 * 彙總數字**（BadgeCounts：航班/航空/聯盟/住宿/品牌/國家數），徽章由前端以同一份
 * [lib/badges.ts] 純函式推導。**不含任何逐筆紀錄：無日期、航班號、航線、飯店名、
 * 品牌明細或國家清單**——「哪家航空/哪個品牌」屬於登入檢視限定
 * （collection.actions.ts 的隱私註記：逐筆紀錄比照收據不進公開路由）。
 *
 * 分享為 opt-in；未產生分享碼者（或碼已撤銷）一律回 404。
 */

type LeanTrip = {
  _id: Types.ObjectId;
  destinationLocation?: Location | null;
};
type LeanDay = { location?: Location | null };

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
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

    const [flights, stays, trips] = await Promise.all([
      FlightRecord.find({ user: user._id }).select('airline').lean<{ airline: string }[]>(),
      StayRecord.find({ user: user._id }).select('brand').lean<{ brand?: string | null }[]>(),
      Trip.find({ 'members.user': user._id }).select('destinationLocation').lean<LeanTrip[]>(),
    ]);

    const days =
      trips.length > 0
        ? await ItineraryDay.find({ trip: { $in: trips.map((t) => t._id) } })
            .select('location')
            .lean<LeanDay[]>()
        : [];

    // 造訪國家數：與 getCollections / 年度回顧同口徑（出發/目的地 ∪ 行程日地點國碼）。
    const countries = new Set<string>();
    const addCountry = (c: string | undefined | null) => {
      if (c) countries.add(c.toUpperCase());
    };
    for (const t of trips) {
      addCountry(t.destinationLocation?.country_code);
    }
    for (const d of days) addCountry(d.location?.country_code);

    const payload: BadgeCounts = computeBadgeCounts(
      flights,
      stays.map((s) => ({ brand: s.brand ?? null })),
      countries.size
    );
    return NextResponse.json(payload);
  } catch (error) {
    logger.error('Get public collections error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
