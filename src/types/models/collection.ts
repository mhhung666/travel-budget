/**
 * 旅行成就（Collections，ROADMAP #19）的前端 DTO。
 * user-level 終身紀錄（飛行 / 住宿）＋由旅程資料推導的造訪國家。
 */

export type DatePrecision = 'day' | 'month' | 'year';
export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface FlightRecordItem {
  id: string;
  /** 連結的旅程；null＝手動補登（或旅程已刪除、連結已解除）。 */
  trip_id: string | null;
  /** 來源行程活動 id（一鍵帶入）；null＝手動補登。 */
  source_activity_id: string | null;
  /** YYYY-MM-DD；依 date_precision 只取有效部分顯示。 */
  date: string;
  date_precision: DatePrecision;
  /** IATA 航空公司代碼（目錄見 public/data/airlines.json）。 */
  airline: string;
  /** 完整航班號（如 BR182）；'' = 未填。 */
  flight_no: string;
  /** IATA 機場代碼；null = 未填。 */
  from_airport: string | null;
  to_airport: string | null;
  cabin: CabinClass | null;
  note: string;
  created_at: string;
}

export interface StayRecordItem {
  id: string;
  trip_id: string | null;
  /** 來源行程活動 id（一鍵帶入）；null＝手動補登。 */
  source_activity_id: string | null;
  /** 入住日 YYYY-MM-DD；依 date_precision 只取有效部分顯示。 */
  check_in: string;
  date_precision: DatePrecision;
  nights: number | null;
  /** 品牌目錄 id（hotelBrands.ts）；null = 獨立旅宿/未知品牌。 */
  brand: string | null;
  hotel_name: string;
  /** 自報星級 1–5；null = 未填。 */
  stars: number | null;
  /** 城市（自由文字）；'' = 未填。 */
  city: string;
  note: string;
  created_at: string;
}

/** 造訪過的國家（由旅程出發/目的地與行程日地點推導，與地圖/回顧同口徑）。 */
export interface VisitedCountryItem {
  /** ISO 3166-1 alpha-2（大寫）。 */
  code: string;
  /** 到訪過的旅程數。 */
  trip_count: number;
}

export interface CollectionsData {
  flights: FlightRecordItem[];
  stays: StayRecordItem[];
  countries: VisitedCountryItem[];
}

/**
 * 某旅程中「我已帶入成就」的行程活動 id 集合（行程頁顯示已帶入狀態、防重複帶入）。
 * per-user：只包含目前使用者自己的紀錄。
 */
export interface TripCollectionLinks {
  flight_activity_ids: string[];
  stay_activity_ids: string[];
}
