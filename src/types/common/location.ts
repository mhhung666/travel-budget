/**
 * 地點資訊（用於地圖顯示）
 */
export interface Location {
  /** 地點名稱（顯示用） */
  name: string;
  /** 完整地址 */
  display_name: string;
  /** 緯度 */
  lat: number;
  /** 經度 */
  lon: number;
  /** 國家 */
  country?: string;
  /** 國家代碼 */
  country_code?: string;
}
