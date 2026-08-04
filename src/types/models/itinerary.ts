import type { Location } from '../common/location';
import type { ExpenseAttachment } from './expense';

/** 活動類型。`transport` 僅供舊資料相容，新活動改用 flight / ground_transport。 */
export type ActivityType =
  | 'sightseeing'
  | 'food'
  | 'flight'
  | 'ground_transport'
  | 'transport'
  | 'accommodation'
  | 'shopping'
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
  /** 尚未 geocoding 的地點文字；不含座標。 */
  location_name?: string;
  note: string;
  /** 訂位/票券確認碼；公開分享頁不會帶出此欄位（為空字串）。 */
  confirmation_code: string;
  /**
   * 票券附件（訂房單 / 機票…）。同收據：存於 R2 私有 bucket，這裡只帶 key + 中繼資料；
   * 要檢視時呼叫 getItineraryAttachmentUrl 取短效簽名 URL。公開分享頁不會帶出（為空陣列）。
   */
  attachments: ExpenseAttachment[];
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
