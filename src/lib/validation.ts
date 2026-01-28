import { z } from 'zod';

// Currency codes
export const CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'HKD'] as const;
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

// Location schema
export const locationSchema = z.object({
  name: z.string(),
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
    location: locationSchema.optional().nullable(),
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
    location: locationSchema.nullable().optional(),
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

// Expense schemas
export const createExpenseSchema = z.object({
  payer_id: z.number().int().positive('付款人 ID 必須為正整數'),
  original_amount: z.number().positive('金額必須大於 0'),
  currency: z.enum(CURRENCIES, { error: '不支援的幣別' }),
  exchange_rate: z.number().positive('匯率必須大於 0').default(1.0),
  description: z.string().min(1, '描述不能為空'),
  category: z.enum(CATEGORIES, { error: '不支援的消費類別' }).default('other'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式錯誤'),
  split_with: z.array(z.number().int().positive()).min(1, '至少需要一位分帳對象'),
});

export const updateExpenseSchema = z.object({
  original_amount: z.number().positive('金額必須大於 0').optional(),
  currency: z.enum(CURRENCIES, { error: '不支援的幣別' }).optional(),
  exchange_rate: z.number().positive('匯率必須大於 0').optional(),
  description: z.string().min(1, '描述不能為空').optional(),
  category: z.enum(CATEGORIES, { error: '不支援的消費類別' }).optional(),
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

// Type exports
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddVirtualMemberInput = z.infer<typeof addVirtualMemberSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
