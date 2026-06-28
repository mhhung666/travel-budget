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
    // Email 通知開關（opt-out）。預設開；缺值（舊資料）以讀取端 `!== false` 視為開啟，
    // 故無需遷移。關閉後 notify() 的 Email fan-out 會跳過此使用者（站內通知不受影響）。
    notifyByEmail: { type: Boolean, default: true },
    // Email 寄送時採用的語系（站內通知靠前端依檢視者語系即時渲染，但 Email 由伺服端
    // 寄出，需在此決定語系）。預設 app 預設語系；設定頁存檔時自動帶入當前 UI 語系。
    locale: { type: String, default: 'zh' },
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
