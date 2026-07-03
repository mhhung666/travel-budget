import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 排序後的 user pair 鍵（`<小id>:<大id>`）。unique index 建在這個鍵上，
 * 同時防止重複邀請與反向重複（A→B 存在時 B→A 也會撞鍵）。
 */
export function friendshipPairKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

/**
 * 好友關係（ROADMAP #12 Phase 1）。
 *
 * 一段關係一份文件：requester 發出邀請、recipient 接受後 status 轉 accepted。
 * 刻意不用 User.friends[] 雙陣列——好友是「關係 + 狀態機」，單一文件讓「接受」
 * 是一次原子更新（Mongo 無 cascade，雙陣列有不一致風險），也預留未來 blocked 狀態。
 * 虛擬成員（User.isVirtual）不參與好友關係，由 actions 層擋下。
 *
 * 無 cascade：目前唯一會刪 User 的路徑只刪虛擬成員（不可能有好友關係）；
 * 未來若新增「刪除帳號」路徑，必須手動刪除該使用者的 Friendship 文件。
 */
const FriendshipSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending', required: true },
    // 由 pre('validate') 自動計算，不要手動指定。
    pairKey: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

FriendshipSchema.pre('validate', function () {
  if (this.requester && this.recipient) {
    this.pairKey = friendshipPairKey(this.requester.toString(), this.recipient.toString());
  }
});

FriendshipSchema.index({ pairKey: 1 }, { unique: true });
// 「我的好友 / 我收到、送出的邀請」查詢兩側各建一個索引
FriendshipSchema.index({ requester: 1, status: 1 });
FriendshipSchema.index({ recipient: 1, status: 1 });

export type FriendshipDoc = InferSchemaType<typeof FriendshipSchema>;

export const Friendship: Model<FriendshipDoc> =
  (mongoose.models.Friendship as Model<FriendshipDoc>) ??
  mongoose.model<FriendshipDoc>('Friendship', FriendshipSchema);
