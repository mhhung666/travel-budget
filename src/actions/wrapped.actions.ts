'use server';

import { Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Trip, Expense, ItineraryDay, FlightRecord, StayRecord } from '@/models';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { YearInReviewData, Location } from '@/types';
import {
  computeYearInReview,
  availableReviewYears,
  type YearInReviewTrip,
  type YearInReviewPlace,
  type YearInReviewExpense,
  type YearInReviewFlight,
  type YearInReviewStay,
} from '@/lib/yearInReview';
import { logger } from '@/lib/logger';

/** 年度回顧 action 的回傳：選定年份的數字 + 可切換的年份清單。 */
export interface YearInReviewResult {
  review: YearInReviewData;
  /** 有資料可回顧的年份（新到舊）；空＝此使用者尚無旅行/支出。 */
  availableYears: number[];
}

type LeanMember = { user?: { _id: Types.ObjectId; isVirtual?: boolean } | null };
type LeanTrip = {
  _id: Types.ObjectId;
  startDate?: Date | null;
  endDate?: Date | null;
  departureLocation?: Location | null;
  destinationLocation?: Location | null;
  members: LeanMember[];
};
type LeanExpense = {
  date: Date;
  category: string | null;
  splits: { user: Types.ObjectId; shareAmount: number }[];
};
type LeanDay = { trip: Types.ObjectId; location?: Location | null };

const toYmd = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

const toPoint = (loc: Location | null | undefined) =>
  loc && typeof loc.lat === 'number' && typeof loc.lon === 'number'
    ? { lat: loc.lat, lon: loc.lon, countryCode: loc.country_code }
    : null;

/**
 * 年度旅行回顧（Travel Wrapped）。個人跨旅程視角（比照 getStats，不走 getTripMembership）。
 *
 * 撈使用者所有旅程（地理）+ 自己有分攤的支出（花費）+ 行程日地點（城市），交給純函式
 * [computeYearInReview] 彙整。`year` 省略/ null 時取最近一個有資料的年份。
 * 金額（總花費/分類）只在此登入 action 回傳；公開分享走另一支去識別化路由。
 */
export const getYearInReview = withAuth(
  async (session, year?: number | null): Promise<ActionResult<YearInReviewResult>> => {
    try {
      await dbConnect();

      const trips = await Trip.find({ 'members.user': session.userId })
        .select('startDate endDate departureLocation destinationLocation members')
        .populate('members.user', 'isVirtual')
        .lean<LeanTrip[]>();

      if (trips.length === 0) {
        return {
          success: true,
          data: { review: emptyReview(year ?? new Date().getFullYear()), availableYears: [] },
        };
      }

      const tripIds = trips.map((t) => t._id);

      type LeanFlightRec = { airline: string; date: Date };
      type LeanStayRec = { brand?: string | null; checkIn: Date };
      const [expenses, days, flightRecs, stayRecs] = await Promise.all([
        Expense.find({ trip: { $in: tripIds }, 'splits.user': session.userId })
          .select('date category splits')
          .lean<LeanExpense[]>(),
        ItineraryDay.find({ trip: { $in: tripIds } })
          .select('trip location')
          .lean<LeanDay[]>(),
        // 旅行成就（user-level，不限這些 trips）：全歷史撈——「新解鎖」要看首次出現年份
        FlightRecord.find({ user: session.userId }).select('airline date').lean<LeanFlightRec[]>(),
        StayRecord.find({ user: session.userId }).select('brand checkIn').lean<LeanStayRec[]>(),
      ]);

      // 投影成純函式輸入。
      const reviewTrips: YearInReviewTrip[] = trips.map((t) => ({
        id: t._id.toString(),
        startDate: toYmd(t.startDate),
        endDate: toYmd(t.endDate),
        departure: toPoint(t.departureLocation),
        destination: toPoint(t.destinationLocation),
        memberIds: t.members
          .filter((m) => m.user && !m.user.isVirtual)
          .map((m) => m.user!._id.toString()),
      }));

      const reviewExpenses: YearInReviewExpense[] = expenses.map((e) => ({
        date: toYmd(e.date) ?? '',
        category: e.category ?? null,
        shareAmount: e.splits.find((s) => s.user.toString() === session.userId)?.shareAmount ?? 0,
      }));

      const reviewPlaces: YearInReviewPlace[] = [];
      for (const d of days) {
        const p = toPoint(d.location);
        if (p) reviewPlaces.push({ tripId: d.trip.toString(), ...p });
      }

      const reviewFlights: YearInReviewFlight[] = flightRecs.map((f) => ({
        airline: f.airline,
        date: toYmd(f.date) ?? '',
      }));
      const reviewStays: YearInReviewStay[] = stayRecs.map((s) => ({
        brand: s.brand ?? null,
        checkIn: toYmd(s.checkIn) ?? '',
      }));

      const availableYears = availableReviewYears(reviewTrips, reviewExpenses);
      const targetYear = year ?? availableYears[0] ?? new Date().getFullYear();
      const review = computeYearInReview(
        {
          trips: reviewTrips,
          itinerary: reviewPlaces,
          expenses: reviewExpenses,
          flights: reviewFlights,
          stays: reviewStays,
          selfUserId: session.userId,
        },
        targetYear
      );

      return { success: true, data: { review, availableYears } };
    } catch (error) {
      logger.error('Get year in review error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/** 完全無資料時的零值回顧（避免前端特例）。 */
function emptyReview(year: number): YearInReviewData {
  return {
    year,
    tripCount: 0,
    countryCount: 0,
    cityCount: 0,
    distanceKm: 0,
    longestTripDays: 0,
    companionCount: 0,
    totalSpend: 0,
    expenseCount: 0,
    topCategory: null,
    categoryBreakdown: [],
    monthlySpend: new Array<number>(12).fill(0),
    busiestMonth: null,
  };
}
