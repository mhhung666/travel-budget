/** 地圖上的一個旅程點（由 TripWithMembers 投影而來，只留地圖需要的欄位）。 */
export interface TripPoint {
  id: string;
  hashCode: string;
  /** 已依當前語系挑好的顯示地名 */
  name: string;
  lat: number;
  lon: number;
  startDate: string | null;
  endDate: string | null;
  /** ISO 3166-1 alpha-2 國家代碼（用於國旗與配色） */
  countryCode?: string;
}
