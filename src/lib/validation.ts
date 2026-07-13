import { z } from 'zod';
import { SUPPORTED_CURRENCY_CODES } from '@/constants/currencies';

// Currency codes
// 精選常用 6 種（保留供既有引用）；實際可接受的幣別為完整 ISO 4217 集合（見下方 schema）。
export const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

// 幣別代碼驗證：接受任何 ISO 4217 幣別（不再限於精選 6 種）。
export const currencyCodeSchema = z
  .string()
  .refine((c) => SUPPORTED_CURRENCY_CODES.has(c), '不支援的幣別');

// Expense categories
export const CATEGORIES = [
  'accommodation',
  'transportation',
  'food',
  'shopping',
  'entertainment',
  'tickets',
  'other',
] as const;
export type ExpenseCategory = (typeof CATEGORIES)[number];

// MongoDB ObjectId（24 碼十六進位字串）。不 import mongoose 以避免污染 client bundle。
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, '無效的 ID 格式');

// Location schema
export const locationSchema = z.object({
  name: z.string(),
  names: z.record(z.string(), z.string()).optional(),
  display_name: z.string(),
  lat: z.number(),
  lon: z.number(),
  country: z.string().optional(),
  country_code: z.string().optional(),
});

// Trip schemas
export const createTripSchema = z
  .object({
    name: z.string().min(1, '旅行名稱不能為空').trim(),
    description: z.string().optional(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    departure_location: locationSchema.optional().nullable(),
    destination_location: locationSchema.optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.start_date) <= new Date(data.end_date);
      }
      return true;
    },
    { message: '開始日期不能晚於結束日期' }
  );

export const updateTripSchema = z
  .object({
    name: z.string().min(1, '旅行名稱不能為空').trim().optional(),
    description: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    departure_location: locationSchema.nullable().optional(),
    destination_location: locationSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return new Date(data.start_date) <= new Date(data.end_date);
      }
      return true;
    },
    { message: '開始日期不能晚於結束日期' }
  );

// 自訂標籤（自由文字，見 ROADMAP.md #18）：單一標籤 1–30 字元，trim 後不可為空。
const tagSchema = z.string().trim().min(1).max(30);

// 收據附件輸入（key 由 createReceiptUploadUrl 簽發；content_type/size 僅供前端顯示，
// 寫入前伺服器端會以 headObject 重新驗證後才採用）
export const attachmentInputSchema = z.object({
  key: z.string().min(1),
  content_type: z.string().min(1),
  size: z.number().int().positive(),
});

// Expense schemas
export const createExpenseSchema = z.object({
  payer_id: objectIdSchema,
  original_amount: z.number().positive('金額必須大於 0'),
  currency: currencyCodeSchema,
  exchange_rate: z.number().positive('匯率必須大於 0').default(1.0),
  description: z.string().min(1, '描述不能為空'),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]).default('other'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式錯誤'),
  splits: z
    .array(
      z.object({
        user_id: objectIdSchema,
        share_amount: z.number().min(0),
      })
    )
    .min(1, '至少需要一位分帳對象'),
  attachments: z.array(attachmentInputSchema).max(10, '收據數量過多').optional(),
  // 可選的關聯行程日（可複選）；空陣列/省略＝不關聯。歸屬（須屬本 trip）由 action 驗證。
  itinerary_day_ids: z.array(objectIdSchema).max(60, '關聯行程日過多').optional(),
  // 自訂標籤（可複選，自由文字）；空陣列/省略＝無標籤。
  tags: z.array(tagSchema).max(20, '標籤數量過多').optional(),
});

export const updateExpenseSchema = z.object({
  payer_id: objectIdSchema.optional(),
  original_amount: z.number().positive('金額必須大於 0').optional(),
  currency: currencyCodeSchema.optional(),
  exchange_rate: z.number().positive('匯率必須大於 0').optional(),
  description: z.string().min(1, '描述不能為空').optional(),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式錯誤')
    .optional(),
  splits: z
    .array(
      z.object({
        user_id: objectIdSchema,
        share_amount: z.number().min(0),
      })
    )
    .min(1, '至少需要一位分帳對象')
    .optional(),
  attachments: z.array(attachmentInputSchema).max(10, '收據數量過多').optional(),
  // 可選的關聯行程日（可複選）；傳空陣列可清除關聯。欄位出現才更新。歸屬由 action 驗證。
  itinerary_day_ids: z.array(objectIdSchema).max(60, '關聯行程日過多').optional(),
  // 自訂標籤（可複選，自由文字）；傳空陣列可清除標籤。欄位出現才更新。
  tags: z.array(tagSchema).max(20, '標籤數量過多').optional(),
});

// Budget schemas（金額一律基準幣 TWD）
export const setBudgetSchema = z.object({
  total: z.number().min(0, '預算不能為負').nullable().optional(),
  categories: z
    .array(
      z.object({
        category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
        amount: z.number().min(0, '預算不能為負'),
      })
    )
    .optional(),
});

// 旅程幣別設定：常用幣別清單（rate 為自訂匯率 1 外幣 = ? TWD，null = 用即時匯率）
// 與新增支出的預設幣別。兩者皆空 → action 會把整個 currencySettings 清為 null。
export const setCurrencySettingsSchema = z.object({
  default_currency: currencyCodeSchema.nullable().optional(),
  currencies: z
    .array(
      z.object({
        code: currencyCodeSchema,
        rate: z.number().positive('匯率必須大於 0').nullable().optional(),
      })
    )
    .max(30, '常用幣別過多')
    .optional(),
});

// Payment schemas（結算還款；金額一律基準幣 TWD）
export const recordPaymentSchema = z
  .object({
    from_id: objectIdSchema,
    to_id: objectIdSchema,
    amount: z.number().positive('金額必須大於 0'),
    note: z.string().trim().max(200, '備註過長').optional(),
  })
  .refine((d) => d.from_id !== d.to_id, {
    message: '付款人與收款人不能相同',
    path: ['to_id'],
  });

// Auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, '請輸入用戶名'),
  password: z.string().min(1, '請輸入密碼'),
});

export const registerSchema = z.object({
  username: z.string().min(3, '用戶名至少需要 3 個字元'),
  display_name: z.string().min(1, '請輸入顯示名稱'),
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(6, '密碼至少需要 6 個字元'),
});

// 忘記密碼步驟一：以 Email 索取驗證碼。locale 帶入當前 UI 語系，供寄信決定語系。
export const requestPasswordResetSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  locale: z.enum(['en', 'zh', 'zh-CN', 'jp']).optional(),
});

// 忘記密碼步驟二：以 Email + 6 位數驗證碼重設密碼。
export const resetPasswordSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  code: z.string().regex(/^\d{6}$/, '驗證碼為 6 位數字'),
  new_password: z.string().min(6, '新密碼至少需要 6 個字元'),
});

// 個人資料 / 密碼更新。Email 變更不走這裡——改用「寄碼驗證新信箱」的兩步流程
// （requestEmailChange / confirmEmailChange），故此處不再接受 new_email。
export const updateProfileSchema = z
  .object({
    display_name: z.string().min(1, '顯示名稱不能為空').optional(),
    current_password: z.string().optional(),
    new_password: z.string().min(6, '新密碼至少需要 6 個字元').optional(),
  })
  .refine(
    (data) => {
      // If new_password is provided, current_password must also be provided
      if (data.new_password && !data.current_password) {
        return false;
      }
      return true;
    },
    { message: '修改密碼需要輸入目前密碼', path: ['current_password'] }
  );

// 變更 Email 步驟一：以目前登入身分索取「新信箱」驗證碼。locale 帶入當前 UI 語系，供寄信決定語系。
export const requestEmailChangeSchema = z.object({
  new_email: z.string().email('請輸入有效的電子郵件'),
  locale: z.enum(['en', 'zh', 'zh-CN', 'jp']).optional(),
});

// 變更 Email 步驟二：輸入寄到新信箱的 6 位數驗證碼以套用變更。
export const confirmEmailChangeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '驗證碼為 6 位數字'),
});

// 通知偏好（Email 開關 + 寄信語系）。locale 收斂為支援語系，無效值由 action 端忽略。
export const notificationPrefsSchema = z.object({
  notify_by_email: z.boolean(),
  locale: z.enum(['en', 'zh', 'zh-CN', 'jp']).optional(),
});

// Web Push 訂閱（W3C PushSubscriptionJSON 的子集，ROADMAP #9 Phase 3）。前端傳入
// subscription.toJSON()，只取送推播必要的 endpoint + keys；expirationTime 不存。
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url('無效的訂閱端點'),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Member schemas
export const addVirtualMemberSchema = z.object({
  display_name: z.string().min(1, '名稱不能為空').trim(),
});

// 從好友一次挑選多人加入旅程（ROADMAP #12 Phase 3）。上限與 UI 一次可選人數對齊。
export const addFriendsToTripSchema = z.object({
  friend_ids: z.array(objectIdSchema).min(1, '請至少選擇一位好友').max(50, '一次最多加入 50 人'),
});

// Itinerary schemas
// "HH:mm" 24 小時制；空字串 / null / 省略皆視為未指定（統一轉成 null）。
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時間格式需為 HH:mm')
  .or(z.literal(''))
  .nullable()
  .optional()
  .transform((v) => v || null);

// 單一活動。不含 id：整個 activities 陣列由 updateItineraryDay 覆寫，子文件 _id 由 Mongoose 重新產生。
export const activitySchema = z.object({
  time: timeOfDaySchema,
  end_time: timeOfDaySchema,
  title: z.string().min(1, '活動標題不能為空').trim(),
  type: z
    .enum(['sightseeing', 'food', 'transport', 'accommodation', 'activity', 'other'])
    .default('other'),
  location: locationSchema.nullable().optional(),
  note: z.string().default(''),
  confirmation_code: z.string().default(''),
  // 票券附件（重用收據的 attachmentInputSchema：只帶 key，size/type 由 action 以 headObject 驗證）。
  attachments: z.array(attachmentInputSchema).max(10, '附件數量過多').optional(),
});

export const createItineraryDaySchema = z.object({
  title: z.string().min(1, '標題不能為空').trim(),
  content: z.string().default(''),
  location: locationSchema.nullable().optional(),
  activities: z.array(activitySchema).optional(),
});

export const updateItineraryDaySchema = z.object({
  title: z.string().min(1, '標題不能為空').trim().optional(),
  content: z.string().optional(),
  day_number: z.number().int().positive().optional(),
  location: locationSchema.nullable().optional(),
  activities: z.array(activitySchema).optional(),
});

// Checklist schemas（打包清單 / 待辦；任何成員皆可編輯）
export const createChecklistSchema = z.object({
  title: z.string().min(1, '清單名稱不能為空').trim(),
});

export const updateChecklistSchema = z.object({
  title: z.string().min(1, '清單名稱不能為空').trim(),
});

export const checklistKindSchema = z.enum(['todo', 'packing', 'shopping']);

// 一次帶項目建立清單（範本 / 從其他旅程複製）；只帶項目文字，勾選一律清空、不帶指派。
export const createChecklistWithItemsSchema = z.object({
  title: z.string().min(1, '清單名稱不能為空').trim(),
  kind: checklistKindSchema.default('todo'),
  items: z.array(z.string().min(1).trim()).max(100, '項目過多（上限 100 項）').default([]),
});

export const addChecklistItemSchema = z.object({
  text: z.string().min(1, '項目內容不能為空').trim(),
  assignee_id: objectIdSchema.nullable().optional(),
});

export const updateChecklistItemSchema = z
  .object({
    text: z.string().min(1, '項目內容不能為空').trim().optional(),
    done: z.boolean().optional(),
    // assignee_id 可被設為 null 以清除指派；故只要欄位有出現就寫入。
    assignee_id: objectIdSchema.nullable().optional(),
  })
  .refine((d) => d.text !== undefined || d.done !== undefined || d.assignee_id !== undefined, {
    message: '沒有可更新的欄位',
  });

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, '留言不能為空').max(1000, '留言過長（上限 1000 字）'),
});

// Note schemas（隨手記；任何成員皆可編輯，比照 Checklist 的成員信任模型）
const noteTextSchema = z.string().trim().min(1, '內容不能為空').max(500, '內容過長（上限 500 字）');
// 照片附件沿用收據的 attachmentInputSchema（只帶 key，size/type 由 action 以 headObject 驗證）。
const noteAttachmentsSchema = z.array(attachmentInputSchema).max(6, '照片數量過多');

export const createNoteSchema = z.object({
  text: noteTextSchema,
  attachments: noteAttachmentsSchema.optional(),
});

export const updateNoteSchema = z
  .object({
    text: noteTextSchema.optional(),
    attachments: noteAttachmentsSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .refine((d) => d.text !== undefined || d.attachments !== undefined || d.pinned !== undefined, {
    message: '沒有可更新的欄位',
  });

export const planNoteSchema = z.object({
  day_id: objectIdSchema,
});

// ── 旅行成就（Collections，ROADMAP #19）──────────────────────────────
// user-level 終身紀錄的補登/編輯。trip_id 沿用 tripIdOrCode 雙重接受
// （ObjectId 或 hash_code，由 action 以 getTripMembership 解析＋驗證成員身分）。
const datePrecisionSchema = z.enum(['day', 'month', 'year']).default('day');
const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式錯誤');
const tripIdOrCodeSchema = z
  .string()
  .regex(/^([0-9a-fA-F]{24}|[a-z0-9]{6,10})$/, '無效的旅程識別碼');

export const createFlightRecordSchema = z.object({
  trip_id: tripIdOrCodeSchema.nullable().optional(),
  date: ymdSchema,
  date_precision: datePrecisionSchema,
  // IATA 航空公司代碼；只驗格式，目錄比對在前端（見 FlightRecord model 註解）
  airline: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}$/, '航空公司代碼格式錯誤'),
  flight_no: z.string().trim().toUpperCase().max(8, '航班號過長').default(''),
  from_airport: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, '機場代碼格式錯誤')
    .nullable()
    .optional(),
  to_airport: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, '機場代碼格式錯誤')
    .nullable()
    .optional(),
  cabin: z.enum(['economy', 'premium_economy', 'business', 'first']).nullable().optional(),
  note: z.string().trim().max(500, '備註過長').default(''),
});

// 表單一律整筆送出（欄位少），更新沿用建立的完整 schema（整筆覆寫語意）。
export const updateFlightRecordSchema = createFlightRecordSchema;

export const createStayRecordSchema = z.object({
  trip_id: tripIdOrCodeSchema.nullable().optional(),
  check_in: ymdSchema,
  date_precision: datePrecisionSchema,
  nights: z.number().int().min(1, '晚數至少 1').max(365, '晚數過大').nullable().optional(),
  // 品牌目錄 id 的存在性由 action 以 HOTEL_BRAND_IDS 驗證（避免 schema 與目錄的 import 循環）
  brand: z.string().max(60).nullable().optional(),
  hotel_name: z.string().trim().min(1, '飯店名稱不能為空').max(120, '飯店名稱過長'),
  stars: z.number().int().min(1).max(5).nullable().optional(),
  city: z.string().trim().max(80, '城市名過長').default(''),
  note: z.string().trim().max(500, '備註過長').default(''),
});

export const updateStayRecordSchema = createStayRecordSchema;

// Type exports
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type CreateChecklistWithItemsInput = z.infer<typeof createChecklistWithItemsSchema>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type CreateItineraryDayInput = z.infer<typeof createItineraryDaySchema>;
export type UpdateItineraryDayInput = z.infer<typeof updateItineraryDaySchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
export type SetCurrencySettingsInput = z.infer<typeof setCurrencySettingsSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
export type AddVirtualMemberInput = z.infer<typeof addVirtualMemberSchema>;
export type AddFriendsToTripInput = z.infer<typeof addFriendsToTripSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type PlanNoteInput = z.infer<typeof planNoteSchema>;
export type CreateFlightRecordInput = z.infer<typeof createFlightRecordSchema>;
export type CreateStayRecordInput = z.infer<typeof createStayRecordSchema>;
