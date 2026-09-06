import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * 單一分類的預算（內嵌於 Trip.members[].budget）。金額一律以基準幣（TWD）計，
 * 與 Expense.amount 同單位，才能直接比對「預算 vs 實際」。
 */
const BudgetCategorySchema = new Schema(
  {
    category: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * 個人旅程預算（內嵌於 Trip.members[]）。total 為總預算，categories 為各分類預算；
 * 皆以基準幣（TWD）計。整個 budget 為 null 代表「尚未設定預算」。
 */
const BudgetSchema = new Schema(
  {
    total: { type: Number, default: null },
    categories: { type: [BudgetCategorySchema], default: [] },
  },
  { _id: false }
);

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
    // 個人預算：只由本人讀寫；DTO 僅輸出 viewer 自己這筆，公開 API 永不輸出。
    budget: { type: BudgetSchema, default: null },
  },
  { _id: false }
);

/**
 * 單一常用幣別（內嵌於 Trip.currencySettings）。rate 為自訂匯率
 * （1 單位外幣 = ? TWD）；null 代表「用即時匯率」。TWD 為基準幣，rate 恆為 null。
 */
const TripCurrencySchema = new Schema(
  {
    code: { type: String, required: true },
    rate: { type: Number, default: null },
  },
  { _id: false }
);

/**
 * 旅程幣別設定（內嵌於 Trip）。defaultCurrency 為新增支出的預設幣別；
 * currencies 為常用幣別清單（含可選的自訂匯率）。整個欄位為 null 代表
 * 「尚未設定」，行為同未有此功能前（預設 TWD、即時匯率）。
 * 注意：改設定不追溯既有支出——每筆支出保留寫入當下的 exchangeRate。
 */
const CurrencySettingsSchema = new Schema(
  {
    defaultCurrency: { type: String, default: null },
    currencies: { type: [TripCurrencySchema], default: [] },
  },
  { _id: false }
);

const TripSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    startDate: { type: Date },
    endDate: { type: Date },
    // 舊版曾用 departureLocation 畫旅行航線。保留欄位只為部署相容與安全回滾；
    // 新版不再讀寫，待相容期結束後由 migration 實體移除。
    departureLocation: { type: Schema.Types.Mixed },
    // 旅行的主要目的地；交通方式與實際航段由 FlightRecord 等獨立紀錄負責。
    destinationLocation: { type: Schema.Types.Mixed },
    hashCode: { type: String, required: true, unique: true },
    // 相簿公開分享碼（opt-in，sparse-unique，hash_code 同格式）。非 null 代表相簿已公開分享，
    // 公開頁 /album/share/<code> 只揭露相片＋說明＋日期＋旅程名，不含位置（PLAN-PHOTOS Phase 4 §8）。
    // 重新產生會換碼、使舊連結立即失效；null／未設代表未分享。
    albumShareCode: { type: String },
    members: { type: [TripMemberSchema], default: [] },
    // 刪除子資料前先設置；背景事件不得在級聯清理途中重新新增紀錄。
    // 不設 default、不回補歷史資料。清理失敗時保留標記，管理員可重試 deleteTrip。
    expenseDeliveryDeleting: { type: Boolean },
    // 舊版全團預算，只供個人預算改版後的過渡提示，不再參與任何進度計算。
    // migration 會將舊 budget 欄位改名至此；全新旅程維持 null。
    legacyBudget: { type: BudgetSchema, default: null },
    // 幣別設定；null 代表未設定（舊資料無此欄位即視為未設定）。
    currencySettings: { type: CurrencySettingsSchema, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// 支援「某使用者參與了哪些旅程」的查詢（multikey index）
TripSchema.index({ 'members.user': 1 });
// 相簿公開分享碼反查（sparse：只有已分享的旅程才進索引；unique：一碼對一旅程）。
TripSchema.index({ albumShareCode: 1 }, { unique: true, sparse: true });

export type TripDoc = InferSchemaType<typeof TripSchema>;
export type TripMember = InferSchemaType<typeof TripMemberSchema>;

export const Trip: Model<TripDoc> =
  (mongoose.models.Trip as Model<TripDoc>) ?? mongoose.model<TripDoc>('Trip', TripSchema);
