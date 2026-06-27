import { Camera, Utensils, Plane, BedDouble, Ticket, MapPin, type LucideIcon } from 'lucide-react';
import type { ActivityType } from '@/types';

/** 活動類型在選單 / 編輯器中的固定顯示順序。對應 model 的 ACTIVITY_TYPES。 */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  'sightseeing',
  'food',
  'transport',
  'accommodation',
  'activity',
  'other',
];

/** 各活動類型的圖示（時間軸與編輯器共用）。 */
export const ACTIVITY_TYPE_ICON: Record<ActivityType, LucideIcon> = {
  sightseeing: Camera,
  food: Utensils,
  transport: Plane,
  accommodation: BedDouble,
  activity: Ticket,
  other: MapPin,
};
