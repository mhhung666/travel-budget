import {
  BedDouble,
  Camera,
  Car,
  MapPin,
  Plane,
  ShoppingBag,
  Ticket,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityType } from '@/types';

/** 活動類型在選單 / 編輯器中的固定顯示順序。對應 model 的 ACTIVITY_TYPES。 */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  'sightseeing',
  'food',
  'flight',
  'ground_transport',
  'accommodation',
  'shopping',
  'activity',
  'other',
];

/** 各活動類型的圖示（時間軸與編輯器共用）。 */
export const ACTIVITY_TYPE_ICON: Record<ActivityType, LucideIcon> = {
  sightseeing: Camera,
  food: Utensils,
  flight: Plane,
  ground_transport: Car,
  transport: Car,
  accommodation: BedDouble,
  shopping: ShoppingBag,
  activity: Ticket,
  other: MapPin,
};
