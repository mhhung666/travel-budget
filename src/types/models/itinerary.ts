import type { Location } from '../common/location';

/** 活動類型（景點 / 餐飲 / 交通 / 住宿 / 活動 / 其他）。對應 model 的 ACTIVITY_TYPES。 */
export type ActivityType =
  | 'sightseeing'
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'activity'
  | 'other';

/** 行程當日的單一活動（前端 DTO）。 */
export interface Activity {
  /** 內嵌子文件 _id，作為前端 render key。 */
  id: string;
  /** "HH:mm" 24h 開始時間；null＝未指定。 */
  time: string | null;
  /** "HH:mm" 24h 結束時間（住宿入退房 / 交通起迄）；null＝未指定。 */
  end_time: string | null;
  title: string;
  type: ActivityType;
  /** 活動地點；未設為 null。 */
  location: Location | null;
  note: string;
  /** 訂位/票券確認碼；公開分享頁不會帶出此欄位（為空字串）。 */
  confirmation_code: string;
}

export interface ItineraryDay {
  id: string;
  trip_id: string;
  day_number: number;
  title: string;
  content: string;
  /** 當日地點（城市等較小範圍）；未設定時為 null。用於旅行地圖熱點。 */
  location: Location | null;
  /** 當日活動時間軸；無活動時為空陣列。 */
  activities: Activity[];
  created_at: string;
  updated_at: string;
}
