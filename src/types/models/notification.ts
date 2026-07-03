/**
 * 站內通知類型（與 models/Notification 的 NOTIFICATION_TYPES 對齊）。
 */
export type NotificationType =
  | 'expense_added'
  | 'payment_recorded'
  | 'member_joined'
  | 'expense_comment_added'
  | 'friend_request'
  | 'friend_accepted';

/**
 * 通知的型別相依結構化資料。各類型只用到其中部分欄位；訊息文案由前端依
 * 收件者語系 + 此 meta 即時組出（i18n），故後端不存預先算好的字串。
 */
export interface NotificationMeta {
  /** expense_added：支出描述 / TWD 金額 / 支出 id。expense_comment_added 的支出描述亦沿用此欄位。 */
  description?: string;
  amount?: number;
  expense_id?: string;
  /** payment_recorded：還款 id。 */
  payment_id?: string;
  /** expense_comment_added：留言 id / 留言內容預覽。 */
  comment_id?: string;
  comment_body?: string;
}

/**
 * 站內通知（前端 DTO）。每位收件者一份；`trip_name` / `actor_name` 為事件當下快照。
 */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  trip_id: string;
  trip_name: string;
  actor_name: string;
  meta: NotificationMeta;
  read: boolean;
  created_at: string;
}
