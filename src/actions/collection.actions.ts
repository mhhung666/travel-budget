'use server';

import { isValidObjectId, Types } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { FlightRecord, StayRecord, LoyaltyEntry, Trip, ItineraryDay } from '@/models';
import type { FlightRecordDoc, StayRecordDoc } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import {
  createFlightRecordSchema,
  updateFlightRecordSchema,
  createStayRecordSchema,
  updateStayRecordSchema,
  type CreateFlightRecordInput,
  type CreateStayRecordInput,
} from '@/lib/validation';
import { HOTEL_BRAND_IDS } from '@/constants/hotelBrands';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type {
  CollectionsData,
  FlightRecordItem,
  StayRecordItem,
  TripCollectionLinks,
  VisitedCountryItem,
  Location,
} from '@/types';
import { logger } from '@/lib/logger';

/**
 * 旅行成就（Collections，ROADMAP #19）：user-level 終身紀錄的 CRUD ＋ 總覽。
 *
 * 與好友系統同屬個人資料——不掛在旅程之下，只驗 session、以 `{ _id, user }` 條件式
 * 原子更新/刪除保證只有本人可動自己的紀錄。唯一碰旅程的地方是「連結旅程」：
 * `trip_id`（ObjectId 或 hash_code）必經 getTripMembership 解析＋驗證成員身分。
 * 隱私比照收據：本檔所有資料不進任何公開分享路由。
 */

type LeanRecordBase = {
  _id: Types.ObjectId;
  trip: Types.ObjectId | null;
  sourceActivity?: Types.ObjectId | null;
  createdAt: Date;
};
type LeanFlight = LeanRecordBase & Omit<FlightRecordDoc, 'user' | 'trip'>;
type LeanStay = LeanRecordBase & Omit<StayRecordDoc, 'user' | 'trip'>;

const toYmd = (d: Date): string => new Date(d).toISOString().slice(0, 10);

function toFlightRecordItem(doc: LeanFlight): FlightRecordItem {
  return {
    id: doc._id.toString(),
    trip_id: doc.trip ? doc.trip.toString() : null,
    source_activity_id: doc.sourceActivity ? doc.sourceActivity.toString() : null,
    date: toYmd(doc.date),
    date_precision: doc.datePrecision ?? 'day',
    airline: doc.airline,
    flight_no: doc.flightNo ?? '',
    from_airport: doc.fromAirport ?? null,
    to_airport: doc.toAirport ?? null,
    cabin: doc.cabin ?? null,
    note: doc.note ?? '',
    created_at: doc.createdAt.toISOString(),
  };
}

function toStayRecordItem(doc: LeanStay): StayRecordItem {
  return {
    id: doc._id.toString(),
    trip_id: doc.trip ? doc.trip.toString() : null,
    source_activity_id: doc.sourceActivity ? doc.sourceActivity.toString() : null,
    check_in: toYmd(doc.checkIn),
    date_precision: doc.datePrecision ?? 'day',
    nights: doc.nights ?? null,
    brand: doc.brand ?? null,
    hotel_name: doc.hotelName,
    stars: doc.stars ?? null,
    city: doc.city ?? '',
    note: doc.note ?? '',
    created_at: doc.createdAt.toISOString(),
  };
}

/**
 * 解析可選的旅程連結：省略/null → null；有值則驗證本人為該旅程成員並回傳實際 ObjectId。
 * 非成員（或旅程不存在）回傳 undefined 表示拒絕——不洩漏兩者差異（比照 NOT_FOUND 慣例）。
 */
async function resolveTripLink(
  userId: string,
  tripIdOrCode: string | null | undefined
): Promise<string | null | undefined> {
  if (!tripIdOrCode) return null;
  const membership = await getTripMembership(userId, tripIdOrCode);
  return membership ? membership.tripId : undefined;
}

/**
 * 驗證「來源行程活動」歸屬（一鍵帶入防偽造）：有帶 source_activity_id 時必須同時連結旅程，
 * 且該活動確實存在於該旅程的行程日中。回傳 false 表示驗證不過。
 */
async function validateSourceActivity(
  tripId: string | null,
  sourceActivityId: string | null | undefined
): Promise<boolean> {
  if (!sourceActivityId) return true;
  if (!tripId) return false;
  const exists = await ItineraryDay.exists({ trip: tripId, 'activities._id': sourceActivityId });
  return exists !== null;
}

/**
 * 成就總覽：我的全部飛行/住宿紀錄（新到舊）＋由旅程資料推導的造訪國家。
 * 國家口徑與地圖/年度回顧一致：旅程出發/目的地國碼 ∪ 行程日地點國碼，計「到訪旅程數」。
 */
export const getCollections = withAuth(async (session): Promise<ActionResult<CollectionsData>> => {
  try {
    await dbConnect();

    type LeanTrip = {
      _id: Types.ObjectId;
      departureLocation?: Location | null;
      destinationLocation?: Location | null;
    };
    type LeanDay = { trip: Types.ObjectId; location?: Location | null };

    const [flights, stays, trips] = await Promise.all([
      FlightRecord.find({ user: session.userId }).sort({ date: -1, _id: -1 }).lean<LeanFlight[]>(),
      StayRecord.find({ user: session.userId }).sort({ checkIn: -1, _id: -1 }).lean<LeanStay[]>(),
      Trip.find({ 'members.user': session.userId })
        .select('departureLocation destinationLocation')
        .lean<LeanTrip[]>(),
    ]);

    const days =
      trips.length > 0
        ? await ItineraryDay.find({ trip: { $in: trips.map((t) => t._id) } })
            .select('trip location')
            .lean<LeanDay[]>()
        : [];

    // 國碼 → 到訪過的旅程 id 集合
    const countryTrips = new Map<string, Set<string>>();
    const addCountry = (code: string | undefined | null, tripId: string) => {
      if (!code) return;
      const key = code.toUpperCase();
      const set = countryTrips.get(key) ?? new Set<string>();
      set.add(tripId);
      countryTrips.set(key, set);
    };
    for (const t of trips) {
      const id = t._id.toString();
      addCountry(t.departureLocation?.country_code, id);
      addCountry(t.destinationLocation?.country_code, id);
    }
    for (const d of days) {
      addCountry(d.location?.country_code, d.trip.toString());
    }

    const countries: VisitedCountryItem[] = [...countryTrips.entries()]
      .map(([code, tripIds]) => ({ code, trip_count: tripIds.size }))
      .sort((a, b) => b.trip_count - a.trip_count || a.code.localeCompare(b.code));

    return {
      success: true,
      data: {
        flights: flights.map(toFlightRecordItem),
        stays: stays.map(toStayRecordItem),
        countries,
      },
    };
  } catch (error) {
    logger.error('Get collections error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
});

/**
 * 某旅程中「我已帶入成就」的活動 id 集合（行程頁顯示已帶入、防重複帶入）。
 * per-user：只查目前使用者自己的紀錄；tripIdOrCode 雙重接受。
 */
export const getTripCollectionLinks = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<TripCollectionLinks>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      type LeanLink = { sourceActivity: Types.ObjectId | null };
      const filter = {
        user: session.userId,
        trip: membership.tripId,
        sourceActivity: { $ne: null },
      };
      const [flights, stays] = await Promise.all([
        FlightRecord.find(filter).select('sourceActivity').lean<LeanLink[]>(),
        StayRecord.find(filter).select('sourceActivity').lean<LeanLink[]>(),
      ]);

      return {
        success: true,
        data: {
          flight_activity_ids: flights.map((f) => f.sourceActivity!.toString()),
          stay_activity_ids: stays.map((s) => s.sourceActivity!.toString()),
        },
      };
    } catch (error) {
      logger.error('Get trip collection links error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

// ── 飛行紀錄 CRUD ────────────────────────────────────────────────────

function flightFields(input: CreateFlightRecordInput, tripId: string | null) {
  return {
    trip: tripId,
    sourceActivity: input.source_activity_id ?? null,
    date: new Date(input.date),
    datePrecision: input.date_precision,
    airline: input.airline,
    flightNo: input.flight_no,
    fromAirport: input.from_airport ?? null,
    toAirport: input.to_airport ?? null,
    cabin: input.cabin ?? null,
    note: input.note,
  };
}

export const createFlightRecord = withAuth(
  async (session, input: CreateFlightRecordInput): Promise<ActionResult<FlightRecordItem>> => {
    try {
      const parsed = createFlightRecordSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const tripId = await resolveTripLink(session.userId, parsed.data.trip_id);
      if (tripId === undefined) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!(await validateSourceActivity(tripId, parsed.data.source_activity_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const doc = await FlightRecord.create({
        user: session.userId,
        ...flightFields(parsed.data, tripId),
      });

      return { success: true, data: toFlightRecordItem(doc.toObject() as LeanFlight) };
    } catch (error) {
      logger.error('Create flight record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const updateFlightRecord = withAuth(
  async (
    session,
    recordId: string,
    input: CreateFlightRecordInput
  ): Promise<ActionResult<FlightRecordItem>> => {
    try {
      if (!isValidObjectId(recordId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const parsed = updateFlightRecordSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const tripId = await resolveTripLink(session.userId, parsed.data.trip_id);
      if (tripId === undefined) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!(await validateSourceActivity(tripId, parsed.data.source_activity_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      // 原子更新：filter 同時帶 _id + 本人（比照好友系統，不做讀改寫）
      const updated = await FlightRecord.findOneAndUpdate(
        { _id: recordId, user: session.userId },
        { $set: flightFields(parsed.data, tripId) },
        { new: true }
      ).lean<LeanFlight | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: toFlightRecordItem(updated) };
    } catch (error) {
      logger.error('Update flight record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const deleteFlightRecord = withAuth(
  async (session, recordId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(recordId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await FlightRecord.deleteOne({ _id: recordId, user: session.userId });
      if (result.deletedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      // 會籍 entry 解除連結（積分仍是賺到的，entry 保留）；同 deleteTrip 對本 collection 的語意
      await LoyaltyEntry.updateMany(
        { user: session.userId, flightRecord: recordId },
        { $set: { flightRecord: null } }
      );

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Delete flight record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

// ── 住宿紀錄 CRUD ────────────────────────────────────────────────────

function stayFields(input: CreateStayRecordInput, tripId: string | null) {
  return {
    trip: tripId,
    sourceActivity: input.source_activity_id ?? null,
    checkIn: new Date(input.check_in),
    datePrecision: input.date_precision,
    nights: input.nights ?? null,
    brand: input.brand ?? null,
    hotelName: input.hotel_name,
    stars: input.stars ?? null,
    city: input.city,
    note: input.note,
  };
}

/** brand 存在性驗證（目錄 id 集合，schema 端只驗長度避免 import 循環）。 */
function isValidBrand(brand: string | null | undefined): boolean {
  return brand == null || HOTEL_BRAND_IDS.has(brand);
}

export const createStayRecord = withAuth(
  async (session, input: CreateStayRecordInput): Promise<ActionResult<StayRecordItem>> => {
    try {
      const parsed = createStayRecordSchema.safeParse(input);
      if (!parsed.success || !isValidBrand(parsed.data.brand)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const tripId = await resolveTripLink(session.userId, parsed.data.trip_id);
      if (tripId === undefined) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!(await validateSourceActivity(tripId, parsed.data.source_activity_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const doc = await StayRecord.create({
        user: session.userId,
        ...stayFields(parsed.data, tripId),
      });

      return { success: true, data: toStayRecordItem(doc.toObject() as LeanStay) };
    } catch (error) {
      logger.error('Create stay record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const updateStayRecord = withAuth(
  async (
    session,
    recordId: string,
    input: CreateStayRecordInput
  ): Promise<ActionResult<StayRecordItem>> => {
    try {
      if (!isValidObjectId(recordId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      const parsed = updateStayRecordSchema.safeParse(input);
      if (!parsed.success || !isValidBrand(parsed.data.brand)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      await dbConnect();

      const tripId = await resolveTripLink(session.userId, parsed.data.trip_id);
      if (tripId === undefined) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }
      if (!(await validateSourceActivity(tripId, parsed.data.source_activity_id))) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      const updated = await StayRecord.findOneAndUpdate(
        { _id: recordId, user: session.userId },
        { $set: stayFields(parsed.data, tripId) },
        { new: true }
      ).lean<LeanStay | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: toStayRecordItem(updated) };
    } catch (error) {
      logger.error('Update stay record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

export const deleteStayRecord = withAuth(
  async (session, recordId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      if (!isValidObjectId(recordId)) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await dbConnect();

      const result = await StayRecord.deleteOne({ _id: recordId, user: session.userId });
      if (result.deletedCount === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      return { success: true, data: { deleted: true } };
    } catch (error) {
      logger.error('Delete stay record error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
