import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 隨手記：旅程下的共享速記（想到但尚未排入行程的點子）。比照 Checklist 為旅程下的
 * 獨立子集合（ref `trip`），採成員信任模型（任何成員皆可建立/編輯/刪除）。
 * `authorName` 為建立當下快照（比照 Comment），讀取免 populate。
 */
/**
 * 隨手記照片附件（內嵌）。比照行程活動的票券附件：只存 R2 物件 key + 中繼資料
 * （私有 receipts bucket，前綴 `notes/`），檢視時走 getNoteAttachmentUrl 簽短效 GET。
 */
const NoteAttachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const NoteSchema = new Schema(
  {
    trip: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    text: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    // 內嵌的照片附件（隨手記照片；同活動票券，讀取免 populate）
    attachments: { type: [NoteAttachmentSchema], default: [] },
    pinned: { type: Boolean, default: false },
    // 已轉成行程活動的時間；null＝尚未規劃。轉換後筆記保留（摺疊區），不可再次轉換。
    plannedAt: { type: Date, default: null },
    // 轉換當下的行程日編號快照（Badge 顯示用）；之後行程日重排不回填，可接受。
    plannedDayNumber: { type: Number, default: null },
  },
  {
    timestamps: true,
  }
);

// 列表查詢的排序索引：釘選優先、新到舊
NoteSchema.index({ trip: 1, pinned: -1, createdAt: -1 });

export type NoteDoc = InferSchemaType<typeof NoteSchema>;

export const Note: Model<NoteDoc> =
  (mongoose.models.Note as Model<NoteDoc>) ?? mongoose.model<NoteDoc>('Note', NoteSchema);
