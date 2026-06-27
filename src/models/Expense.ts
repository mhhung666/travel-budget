import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'accommodation',
  'transportation',
  'food',
  'shopping',
  'entertainment',
  'tickets',
  'other',
] as const;

/**
 * 分帳明細（內嵌於 Expense）。
 * 取代原 expense_splits 表，消除原本逐筆查詢 splits 的 N+1。
 */
const SplitSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shareAmount: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * 收據附件（內嵌於 Expense）。實際檔案存於 R2 私有 receipts bucket，此處只存物件
 * key + 中繼資料；檢視時由 getReceiptUrl 驗成員後簽發短效 URL（不存可直接存取的 URL）。
 * key 命名空間為 receipts/<tripId>/<uuid>.<ext>（見 lib/uploads.ts）；size/contentType
 * 以伺服器端 headObject 驗證後的值為準（非 client 宣稱值）。
 */
const AttachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ExpenseSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    payer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    originalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'TWD' },
    exchangeRate: { type: Number, default: 1 },
    description: { type: String, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other' },
    date: { type: Date, required: true },
    splits: { type: [SplitSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },
    // 可選的關聯行程日（同 trip 下的 ItineraryDay）；null＝未關聯。
    // 行程日被刪除時於 deleteItineraryDay 清為 null（避免孤兒參照）。
    itineraryDay: { type: Schema.Types.ObjectId, ref: 'ItineraryDay', default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export type ExpenseDoc = InferSchemaType<typeof ExpenseSchema>;
export type ExpenseSplit = InferSchemaType<typeof SplitSchema>;

export const Expense: Model<ExpenseDoc> =
  (mongoose.models.Expense as Model<ExpenseDoc>) ??
  mongoose.model<ExpenseDoc>('Expense', ExpenseSchema);
