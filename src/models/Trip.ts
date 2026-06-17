import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 旅程成員（內嵌於 Trip）。
 * 取代原 trip_members 表，把權限檢查收斂成單一文件讀取。
 */
const TripMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    // 個別（軟性）封存：非 null 代表「這名成員」把此旅程從自己的列表收起，
    // 其他成員不受影響。旅程內容仍可正常讀寫。
    archivedAt: { type: Date, default: null },
  },
  { _id: false }
);

const TripSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    // 原 PostgreSQL JSONB 欄位
    location: { type: Schema.Types.Mixed },
    hashCode: { type: String, required: true, unique: true },
    members: { type: [TripMemberSchema], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 支援「某使用者參與了哪些旅程」的查詢（multikey index）
TripSchema.index({ 'members.user': 1 });

export type TripDoc = InferSchemaType<typeof TripSchema>;
export type TripMember = InferSchemaType<typeof TripMemberSchema>;

export const Trip: Model<TripDoc> =
  (mongoose.models.Trip as Model<TripDoc>) ?? mongoose.model<TripDoc>('Trip', TripSchema);
