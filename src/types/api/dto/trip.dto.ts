import type { Location } from '../../common/location';

/**
 * 建立旅程請求
 */
export interface CreateTripDto {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  location?: Location;
}

/**
 * 更新旅程請求
 */
export interface UpdateTripDto {
  name?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: Location | null;
}
