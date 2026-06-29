import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 變更 Email 用的「新信箱驗證碼」暫存。每位使用者最多一筆待驗證的變更（user 唯一 +
 * upsert 覆寫），故重新索取會作廢前一組碼，並可換成不同的新信箱。
 *
 * 設計與 [[PasswordResetCode]] 一致：
 * - **不存明碼**：只存 sha256 雜湊（codeHash）。短效（15 分鐘）+ 嘗試次數上限已足以防暴力。
 * - **TTL 自動清除**：expiresAt 上的 TTL 索引（expireAfterSeconds: 0）讓 Mongo 自動刪除
 *   過期文件，毋須額外清理排程。讀取端仍會再判一次過期以防 TTL 掃描延遲。
 * - **newEmail 一併暫存**：碼寄往「新信箱」，驗證通過才把帳號 email 換成它（確認新信箱屬本人）。
 */
const EmailChangeCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    newEmail: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL：過期即由 Mongo 自動刪除（expireAfterSeconds: 0 → 以 expiresAt 為到期時刻）。
EmailChangeCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type EmailChangeCodeDoc = InferSchemaType<typeof EmailChangeCodeSchema>;

export const EmailChangeCode: Model<EmailChangeCodeDoc> =
  (mongoose.models.EmailChangeCode as Model<EmailChangeCodeDoc>) ??
  mongoose.model<EmailChangeCodeDoc>('EmailChangeCode', EmailChangeCodeSchema);
