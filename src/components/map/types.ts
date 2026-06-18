/** 地圖上的一個座標點（出發地或目的地）。 */
export interface GeoPoint {
  /** 已依當前語系挑好的顯示地名 */
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2 國家代碼（用於國旗與配色） */
  countryCode?: string;
}

/**
 * 地圖上的一趟旅行（由 TripWithMembers 投影而來）。
 * 每趟旅行畫一條「出發地 → 目的地」的線；舊資料可能只有目的地。
 */
export interface TripRoute {
  id: string;
  hashCode: string;
  /** 旅行名稱（標籤用） */
  name: string;
  startDate: string | null;
  endDate: string | null;
  /** 出發地座標；缺座標時為 null（舊資料或未填）。 */
  departure: GeoPoint | null;
  /** 目的地座標；缺座標時為 null。 */
  destination: GeoPoint | null;
}
