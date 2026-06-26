import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 打包清單 / 待辦清單。比照 ItineraryDay 為旅程下的獨立子集合（ref `trip`、以 trip 建索引），
 * 而非塞進 Trip 文件——避免讓每次頁面載入都帶上清單、也避免勾選一個項目就改寫整份 Trip。
 * 清單項目（items）為內嵌子文件（數量有界、整批一起編輯），與 Expense.splits 同樣的取捨。
 * 每個 item 由 Mongoose 自動帶 `_id`，作為逐項操作（勾選 / 編輯 / 指派 / 刪除）的識別碼。
 */
const ChecklistItemSchema = new Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  // 指派給的成員（可為 null＝未指派）；成員被移除時於 removeMember 清為 null。
  assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

const ChecklistSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    title: { type: String, required: true },
    items: { type: [ChecklistItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
  }
);

export type ChecklistDoc = InferSchemaType<typeof ChecklistSchema>;

export const Checklist: Model<ChecklistDoc> =
  (mongoose.models.Checklist as Model<ChecklistDoc>) ??
  mongoose.model<ChecklistDoc>('Checklist', ChecklistSchema);
