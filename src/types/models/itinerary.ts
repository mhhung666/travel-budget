import type { Location } from '../common/location';

export interface ItineraryDay {
  id: string;
  trip_id: string;
  day_number: number;
  title: string;
  content: string;
  /** 當日地點（城市等較小範圍）；未設定時為 null。用於旅行地圖熱點。 */
  location: Location | null;
  created_at: string;
  updated_at: string;
}
