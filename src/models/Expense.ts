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
