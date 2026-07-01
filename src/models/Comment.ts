import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 支出留言（#10）。掛在單筆 Expense 下的討論串，trip-scoped 獨立 collection
 * （比照 ActivityLog / Notification 的取捨，而非內嵌於 Expense）。
 *
 * - **去正規化 `authorName`**：事件當下的快照（讀取免 populate，符合避免 N+1 的慣例）；
 *   事後改名 / 移除成員不回溯，是可接受且語意正確的。
 * - 刪除權限比其餘 data-level 刪除更嚴格（僅作者本人或旅程 admin），因為留言的個人語意
 *   更接近聊天訊息，見 comment.actions.ts。
 *
 * 無外鍵 cascade：刪除 Expense / Trip 時需手動清理（見 deleteExpense / deleteTrip）。
 */
const CommentSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    expense: { type: Schema.Types.ObjectId, ref: 'Expense', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    body: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 單筆支出的留言串查詢：舊到新。
CommentSchema.index({ expense: 1, createdAt: 1 });
// deleteTrip 級聯清理 + 全 trip 留言數彙總（getCommentCounts）。
CommentSchema.index({ trip: 1, createdAt: -1 });

export type CommentDoc = InferSchemaType<typeof CommentSchema>;

export const Comment: Model<CommentDoc> =
  (mongoose.models.Comment as Model<CommentDoc>) ??
  mongoose.model<CommentDoc>('Comment', CommentSchema);
