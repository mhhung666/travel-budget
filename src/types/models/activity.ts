/**
 * 動態牆（活動紀錄）事件類型（與 models/ActivityLog 的 ACTIVITY_TYPES 對齊）。
 *
 * 命名刻意用 `ActivityLog*`：行程子系統已有不同概念的 `ActivityType` / `Activity`
 * （景點/餐飲/交通…），兩者不可混用。
 */
export type ActivityLogType =
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'payment_recorded'
  | 'member_joined'
  | 'itinerary_imported';

/**
 * 活動紀錄的型別相依結構化資料。各類型只用到其中部分欄位；訊息文案由前端依
 * 檢視者語系 + 此 meta 即時組出（i18n），故後端不存預先算好的字串。
 */
export interface ActivityLogMeta {
  /** expense_*：支出描述 / TWD 金額 / 支出 id（deleted 時 id 已失效，僅供顯示）。 */
  description?: string;
  amount?: number;
  expense_id?: string;
  /** payment_recorded：還款金額 / 還款 id。 */
  payment_id?: string;
  /** itinerary_imported：實際新增的日期與活動數（不含原文或活動內容）。 */
  days?: number;
  activities?: number;
}

/**
 * 一筆活動紀錄（前端 DTO）。旅程層級共享；`actor_name` 為事件當下快照。
 */
export interface ActivityLogItem {
  id: string;
  type: ActivityLogType;
  actor_name: string;
  meta: ActivityLogMeta;
  created_at: string;
}
