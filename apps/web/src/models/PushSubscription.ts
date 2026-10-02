import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 一筆瀏覽器 Web Push 訂閱（ROADMAP #9 Phase 3）。
 *
 * 對應 `PushSubscriptionJSON`（W3C Push API）：`endpoint` 為推播服務 URL，`keys`
 * 為加密用的 `p256dh` / `auth`。一位使用者可有多筆（不同裝置/瀏覽器各一）。
 *
 * 設計取捨：
 * - **endpoint 唯一**：同一裝置重複訂閱會回相同 endpoint，upsert 去重即可（避免一台
 *   裝置堆疊多筆而重複收到推播）。
 * - **失效自動回收**：推播服務回 404/410 代表訂閱已失效（使用者清掉/到期），由
 *   lib/webpush.ts 在送推播時就地刪除（標準做法），故無需另開 cron 清理。
 * - 訂閱屬 **user**（非 trip）：`deleteTrip` 不需 cascade；移除成員亦不動其裝置訂閱。
 */
const PushSubscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    // 訂閱來源的 User-Agent（除錯/裝置辨識用，非必填）。
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// fan-out 時以 user 撈出該使用者的全部裝置訂閱。
PushSubscriptionSchema.index({ user: 1 });

export type PushSubscriptionDoc = InferSchemaType<typeof PushSubscriptionSchema>;

export const PushSubscription: Model<PushSubscriptionDoc> =
  (mongoose.models.PushSubscription as Model<PushSubscriptionDoc>) ??
  mongoose.model<PushSubscriptionDoc>('PushSubscription', PushSubscriptionSchema);
