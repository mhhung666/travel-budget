/**
 * 各語言的在地化地名（key 為 app locale：en / zh / zh-CN / jp）。
 * 建立旅行時從 Nominatim 的 namedetails 一次抓齊並存下，
 * 顯示時直接挑當前語言，免再打 API。缺的語言由呼叫端 fallback。
 */
export type LocalizedNames = Record<string, string>;

/**
 * 地點資訊（用於地圖顯示）
 */
export interface Location {
  /** 地點名稱（顯示用） */
  name: string;
  /** 各語言在地化地名（建立時抓存，顯示時依 locale 挑） */
  names?: LocalizedNames;
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
