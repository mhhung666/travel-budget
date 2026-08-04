import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const AI_IMPORT_USAGE_SCOPES = ['global', 'user', 'trip'] as const;

const AiImportUsageSchema = new Schema(
  {
    scope: { type: String, enum: AI_IMPORT_USAGE_SCOPES, required: true },
    scopeKey: { type: String, required: true },
    periodStart: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    requests: { type: Number, required: true, default: 0, min: 0 },
    reservedMicroUsd: { type: Number, required: true, default: 0, min: 0 },
    spentMicroUsd: { type: Number, required: true, default: 0, min: 0 },
    inputTokens: { type: Number, required: true, default: 0, min: 0 },
    outputTokens: { type: Number, required: true, default: 0, min: 0 },
    successfulRequests: { type: Number, required: true, default: 0, min: 0 },
    failedRequests: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One persistent UTC-day bucket per scope. The TTL is cleanup only; periodStart always participates
// in reads, so delayed TTL deletion can never leak usage between days.
AiImportUsageSchema.index({ scope: 1, scopeKey: 1, periodStart: 1 }, { unique: true });
AiImportUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AiImportUsageDoc = InferSchemaType<typeof AiImportUsageSchema>;

export const AiImportUsage: Model<AiImportUsageDoc> =
  (mongoose.models.AiImportUsage as Model<AiImportUsageDoc>) ??
  mongoose.model<AiImportUsageDoc>('AiImportUsage', AiImportUsageSchema);
