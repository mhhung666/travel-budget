import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** One self-only active code and an unpublished delivery candidate per actor.
 * Failed delivery retains the active code; atomic confirmation consumes the whole row.
 * Legacy active codes remain usable until expiry. No plaintext code is persisted.
 */
const EmailChangeCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    newEmail: { type: String },
    originalEmail: { type: String },
    activeExpiresAt: { type: Date },
    candidate: { type: Schema.Types.Mixed },
    codeHash: { type: String },
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
