import type { LocalizedNames } from '../common/location';

/** 座標來源。`exif`＝相片自己的 GPS、`itinerary`＝退回關聯行程日、`manual`＝手動拉釘。 */
export type PhotoLocationSource = 'exif' | 'itinerary' | 'manual';

/** 相片座標（前端 DTO）。null 表示這張沒有地理資訊。 */
export interface PhotoLocation {
  lat: number;
  lon: number;
  source: PhotoLocationSource;
}

/** 反查地名快照（Phase 1 恆為 null，見 models/Photo.ts）。 */
export interface PhotoPlace {
  name: string;
  names?: LocalizedNames;
  country_code?: string;
}

/** 相機參數（全部 optional，缺就是缺）。 */
export interface PhotoExif {
  make?: string;
  model?: string;
  lens?: string;
  iso?: number;
  f_number?: number;
  exposure_time?: number;
  focal_length?: number;
  orientation?: number;
}

/**
 * 相簿的一張相片（前端 DTO）。旅程成員共享；`uploaded_by_name` 為上傳當下快照。
 *
 * `url`／`thumb_url` 是**已簽好**的短效 URL（不同於 Note 的附件只給 key、檢視時才簽）：
 * 相簿一次要顯示幾十張，逐張再打一次 action 簽名會變成 N+1。它們由 presignGetStable
 * 簽發，在同一個窗口內對同一張相片**逐字元相同**，SW 的 CacheFirst 才快取得到。
 *
 * `url` 指向的是**自帶完整 EXIF（含 GPS）的 JPEG**——這是刻意的，使用者下載回手機後
 * Apple 照片／Google 相簿要讀得到地點。也正因如此，**公開分享路由絕不可簽這顆 key**
 * （Phase 4 另簽剝除 APP1 的消毒副本 `_p.jpg`）。
 */
export interface TripPhoto {
  id: string;
  trip_id: string;
  url: string;
  thumb_url: string;
  content_type: string;
  size: number;
  width: number;
  height: number;
  taken_at: string | null;
  location: PhotoLocation | null;
  place: PhotoPlace | null;
  exif: PhotoExif;
  itinerary_day_id: string | null;
  caption: string;
  uploaded_by_id: string;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
}

/**
 * 公開相簿分享（Phase 4 §8）的一張相片。**刻意是獨立型別，不是 `TripPhoto` 加 omit**——
 * 漏一個欄位就是隱私事故，用型別讓它從根本不可能：這裡**沒有** `location`／`place`／`exif`／
 * `key`／上傳者／`trip_id`，只有相片、說明、日期。
 *
 * `url` 指向剝除 APP1 的消毒副本 `_p.jpg`（無 EXIF、無 GPS），`thumb_url` 指向縮圖
 * `_t.webp`（canvas 產生、天生無 EXIF）——公開路由**絕不簽**自帶 GPS 的顯示檔 `.jpg`。
 */
export interface PublicAlbumPhoto {
  id: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  taken_at: string | null;
  caption: string;
}
