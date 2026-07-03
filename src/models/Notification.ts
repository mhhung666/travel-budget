import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 站內通知類型。新增類型時這裡加列舉、i18n 各語系補對應訊息字串
 * （notifications.<type>），UI 才能在「檢視當下」依收件者語系算出文案。
 */
export const NOTIFICATION_TYPES = [
  'expense_added', // 有人新增支出
  'payment_recorded', // 有人登記了與你有關的還款
  'member_joined', // 有新成員加入旅程
  'expense_comment_added', // 有人在支出下留言
  'friend_request', // 有人送出好友邀請（不屬於任何旅程）
  'friend_accepted', // 對方接受了你的好友邀請
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * 一則「站內通知」——每位收件者一份（fan-out 寫入）。
 *
 * 設計取捨：
 * - **per-user**（非 per-trip）：`user` 為收件者，跨旅程的個人收件匣，查詢只認
 *   `user`，故不走 getTripMembership（比照 getStats 的個人視角）。
 * - **去正規化顯示欄位**（`tripName` / `actorName`）：通知是「事件當下」的快照，
 *   即時性與低成本讀取優先（讀取無需 populate，符合避免 N+1 的慣例）；事後改名
 *   不回溯是可接受且語意正確的。
 * - **`meta` 為型別相依的結構化資料**（金額、描述、關聯 id…）而非預先算好的字串，
 *   訊息文案在前端依收件者語系即時組出（i18n）。
 *
 * 無外鍵 cascade：刪除 Trip / 移除成員時需手動清理（見 deleteTrip / removeMember）。
 */
const NotificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // 收件者
    // 好友邀請等「非旅程」通知沒有 trip；舊資料全帶 trip，無需遷移。
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: false },
    tripName: { type: String, default: '' },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // 觸發者
    actorName: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 收件匣查詢：某使用者的通知，新到舊。
NotificationSchema.index({ user: 1, createdAt: -1 });
// 未讀數查詢（badge）。
NotificationSchema.index({ user: 1, read: 1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema>;

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ??
  mongoose.model<NotificationDoc>('Notification', NotificationSchema);
