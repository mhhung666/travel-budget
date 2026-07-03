import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 打包清單 / 待辦清單。比照 ItineraryDay 為旅程下的獨立子集合（ref `trip`、以 trip 建索引），
 * 而非塞進 Trip 文件——避免讓每次頁面載入都帶上清單、也避免勾選一個項目就改寫整份 Trip。
 * 清單項目（items）為內嵌子文件（數量有界、整批一起編輯），與 Expense.splits 同樣的取捨。
 * 每個 item 由 Mongoose 自動帶 `_id`，作為逐項操作（勾選 / 編輯 / 指派 / 刪除）的識別碼。
 */
const ChecklistItemSchema = new Schema({
  text: { type: String, required: true },
  // 勾選改為「誰勾了」的成員陣列（取代舊的單一 `done` boolean）：
  // - packing（行李）＝每人各自勾，doneBy 收各自的 id；
  // - todo / shopping（共享）＝任一人勾即算完成，doneBy 存標記者的 id、清空＝未完成。
  // DTO 對外仍導出 `done`（= doneBy 非空）維持共享清單的相容語意，另帶 `done_by` 供 per-member 渲染。
  // 成員被移除時於 removeMember 一併 $pull 其 id。
  doneBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  // 指派給的成員（可為 null＝未指派）；成員被移除時於 removeMember 清為 null。僅 todo 類型有意義。
  assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

const ChecklistSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    title: { type: String, required: true },
    // 清單類型決定勾選語意與加值行為：'todo' 行前待辦（可指派、共享勾選）、
    // 'packing' 行李打包（per-member 勾選、隱藏指派）、'shopping' 購物（共享勾選、隱藏指派）。
    kind: { type: String, enum: ['todo', 'packing', 'shopping'], default: 'todo' },
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
