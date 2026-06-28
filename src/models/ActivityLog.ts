import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 動態牆（活動紀錄）事件類型。新增類型時這裡加列舉、i18n `activity` 命名空間補
 * 對應訊息字串（activity.<type>），UI 才能在「檢視當下」依檢視者語系算出文案。
 */
export const ACTIVITY_TYPES = [
  'expense_added', // 新增支出
  'expense_updated', // 編輯支出
  'expense_deleted', // 刪除支出
  'payment_recorded', // 登記還款
  'member_joined', // 新成員加入
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * 一筆「活動紀錄」——旅程層級的共享動態牆（#8）。
 *
 * 與 #9 站內通知（per-user 收件匣）的對照取捨：
 * - **per-trip、單筆寫入**（非 per-user fan-out）：一個事件存一筆，全體成員共看同一份
 *   時間軸；查詢走 getTripMembership（旅程層級授權），不是個人收件匣。
 * - **包含觸發者本人**：通知會排除自己，動態牆不會——「誰改了什麼」當然含你自己的動作。
 * - **去正規化 `actorName`**：事件當下的快照（讀取免 populate，符合避免 N+1 的慣例）；
 *   事後改名 / 移除成員不回溯，是可接受且語意正確的（也讓被移除成員的歷史仍可顯示）。
 * - **`meta` 為型別相依的結構化資料**（金額、描述…）而非預先算好的字串，訊息文案在前端
 *   依檢視者語系即時組出（i18n）。
 *
 * 無外鍵 cascade：刪除 Trip 時需手動清理（見 deleteTrip）。
 */
const ActivityLogSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // 觸發者
    actorName: { type: String, default: '' },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 動態牆查詢：某旅程的活動，新到舊。
ActivityLogSchema.index({ trip: 1, createdAt: -1 });

export type ActivityLogDoc = InferSchemaType<typeof ActivityLogSchema>;

export const ActivityLog: Model<ActivityLogDoc> =
  (mongoose.models.ActivityLog as Model<ActivityLogDoc>) ??
  mongoose.model<ActivityLogDoc>('ActivityLog', ActivityLogSchema);
