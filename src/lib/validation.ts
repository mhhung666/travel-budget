import { z } from 'zod';

// Currency codes
export const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

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
  currency: z.enum(CURRENCIES as unknown as [string, ...string[]]),
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
});

export const updateExpenseSchema = z.object({
  payer_id: objectIdSchema.optional(),
  original_amount: z.number().positive('金額必須大於 0').optional(),
  currency: z.enum(CURRENCIES as unknown as [string, ...string[]]).optional(),
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

export const resetPasswordSchema = z.object({
  username: z.string().min(1, '請輸入用戶名'),
  email: z.string().email('請輸入有效的電子郵件'),
  new_password: z.string().min(6, '新密碼至少需要 6 個字元'),
});

export const updateProfileSchema = z
  .object({
    display_name: z.string().min(1, '顯示名稱不能為空').optional(),
    new_email: z.string().email('請輸入有效的電子郵件').optional(),
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

// Member schemas
export const addVirtualMemberSchema = z.object({
  display_name: z.string().min(1, '名稱不能為空').trim(),
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

// Type exports
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;
export type AddChecklistItemInput = z.infer<typeof addChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type CreateItineraryDayInput = z.infer<typeof createItineraryDaySchema>;
export type UpdateItineraryDayInput = z.infer<typeof updateItineraryDaySchema>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddVirtualMemberInput = z.infer<typeof addVirtualMemberSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
