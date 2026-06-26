import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    isVirtual: { type: Boolean, default: false },
    // 旅行地圖公開分享碼：opt-in，產生時才寫入。null/缺值代表未分享。
    // 解析方式與 Trip.hashCode 相同（短 hash code），見 actions/mapShare.actions.ts。
    mapShareCode: { type: String },
    // 頭像公開 URL（R2 公開 avatars bucket 的穩定網址）。null/缺值＝未設定。
    avatarUrl: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 公開分享碼查詢；sparse 讓未分享（無此欄位）的使用者不佔唯一鍵。
UserSchema.index({ mapShareCode: 1 }, { unique: true, sparse: true });

export type UserDoc = InferSchemaType<typeof UserSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>('User', UserSchema);
