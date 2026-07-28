/**
 * 熱力圖的一個點：座標 + 權重（造訪次數）。
 * name/countryCode 可選——公開分享頁去識別化時只有座標與權重。
 */
export interface HeatPoint {
  lat: number;
  lon: number;
  weight: number;
  name?: string;
  countryCode?: string;
}

/** 地圖上的一個座標點。 */
export interface GeoPoint {
  /** 已依當前語系挑好的顯示地名 */
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2 國家代碼（用於國旗與配色） */
  countryCode?: string;
}

/** 飛行航線圖的機場端點（自 airports.json 目錄解析出座標）。 */
export interface AirportPoint {
  iata: string;
  /** 顯示名（城市優先，退回機場名）。 */
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2。 */
  country?: string | null;
}

/**
 * 飛行航段（旅行成就 FlightRecord 依「出發→抵達」聚合）。
 * 登入限定——飛行紀錄是個人資料，公開分享地圖不含此圖層。
 */
export interface FlightSegment {
  /** `${fromIata}-${toIata}`（方向性）。 */
  key: string;
  from: AirportPoint;
  to: AirportPoint;
  /** 此航段的飛行次數（線寬權重）。 */
  count: number;
}

/** 旅行的主要目的地；只畫點位，不代表實際交通航段。 */
export interface TripDestinationPoint extends GeoPoint {
  id: string;
  tripName: string;
  startDate: string | null;
  endDate: string | null;
}
