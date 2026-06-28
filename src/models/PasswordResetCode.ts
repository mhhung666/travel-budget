import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 忘記密碼用的「Email 驗證碼」暫存。每位使用者最多一筆有效碼（user 唯一 + upsert
 * 覆寫），故重新索取會作廢前一組碼。
 *
 * 設計重點：
 * - **不存明碼**：只存 sha256 雜湊（codeHash）。驗證碼短效（15 分鐘）+ 嘗試次數上限
 *   （attempts）已足以防暴力破解，無需 bcrypt 的成本。
 * - **TTL 自動清除**：expiresAt 上的 TTL 索引（expireAfterSeconds: 0）讓 Mongo 自動
 *   刪除過期文件，毋須額外清理排程。讀取端仍會再判一次過期以防 TTL 掃描延遲。
 */
const PasswordResetCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// TTL：過期即由 Mongo 自動刪除（expireAfterSeconds: 0 → 以 expiresAt 為到期時刻）。
PasswordResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetCodeDoc = InferSchemaType<typeof PasswordResetCodeSchema>;

export const PasswordResetCode: Model<PasswordResetCodeDoc> =
  (mongoose.models.PasswordResetCode as Model<PasswordResetCodeDoc>) ??
  mongoose.model<PasswordResetCodeDoc>('PasswordResetCode', PasswordResetCodeSchema);
