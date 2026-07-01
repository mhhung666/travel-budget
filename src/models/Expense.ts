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
    // 可選的關聯行程日（同 trip 下的 ItineraryDay）；空陣列＝未關聯。可複選——例如
    // 跨夜飯店可同時關聯多天，每日花費聚合時把金額平均分攤到所選天數（見 lib/tripStats）。
    // 行程日被刪除時於 deleteItineraryDay 從陣列 $pull 掉（避免孤兒參照）。
    itineraryDays: { type: [Schema.Types.ObjectId], ref: 'ItineraryDay', default: [] },
    // 新增此筆支出的使用者（≠ payer：可代他人付款的人記帳）。供每日支出摘要 Email
    // 排除「收件者自己加的」。additive、舊資料無此欄位（視為非本人），無遷移。
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 自訂標籤（自由文字、可複選），與 category 正交——category 維持固定 7 類（供預算比對），
    // tags 供使用者自訂分組（簽證、保險、紀念品…），統計依 tag 各自加總（ROADMAP #18）。
    tags: { type: [String], default: [] },
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
