import { z } from 'zod';

export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const dateSchema = z.iso.date();
export const loginInput = z
  .object({ username: z.string().min(1).max(200), password: z.string().min(1).max(1024) })
  .strict();
export const refreshInput = z.object({ refreshToken: z.string().min(1).max(2048) }).strict();
export const userSchema = z.object({ id: idSchema, username: z.string(), displayName: z.string() });
export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: userSchema,
});
export const tripSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  startDate: dateSchema.nullable(),
  endDate: dateSchema.nullable(),
  destination: z.string().nullable(),
  archived: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  mySpent: z.number(),
  myBalance: z.number(),
  phase: z.enum(['upcoming', 'ongoing', 'past', 'unscheduled']),
});
export const landingSchema = tripSchema.extend({
  role: z.enum(['admin', 'member']),
  expenseCount: z.number().int().nonnegative(),
  todayGroupSpent: z.number(),
  budgetTotal: z.number().nullable(),
});
export const tripsSchema = z.object({
  items: z.array(tripSchema),
  nextPage: z.number().int().positive().nullable(),
});
export const expenseCategories = [
  'accommodation',
  'transportation',
  'food',
  'shopping',
  'entertainment',
  'tickets',
  'other',
] as const;
export const expenseCategorySchema = z.enum(expenseCategories);
// Member ids are null only when a stored reference no longer resolves to a user.
const memberIdSchema = idSchema.nullable();
// Attachments, tags and itinerary links are intentionally absent from mobile expense DTOs.
export const expenseSchema = z.object({
  id: idSchema,
  date: dateSchema,
  description: z.string(),
  category: expenseCategorySchema,
  payerId: memberIdSchema,
  payerName: z.string(),
  amount: z.number(),
  originalAmount: z.number(),
  currency: z.string(),
});
export const expenseDetailSchema = expenseSchema.extend({
  exchangeRate: z.number(),
  splits: z.array(
    z.object({ userId: memberIdSchema, displayName: z.string(), shareAmount: z.number() })
  ),
});
export const expensesSchema = z.object({
  items: z.array(expenseSchema),
  nextCursor: z.string().nullable(),
});
export const settlementSchema = z.object({
  status: z.enum(['empty', 'settled', 'outstanding']),
  totalExpenses: z.number(),
  balances: z.array(
    z.object({
      userId: idSchema,
      displayName: z.string(),
      totalPaid: z.number(),
      totalOwed: z.number(),
      balance: z.number(),
    })
  ),
  // Suggestions computed after registered payments; none of them has been paid yet.
  suggestedTransfers: z.array(
    z.object({
      fromId: idSchema,
      fromName: z.string(),
      toId: idSchema,
      toName: z.string(),
      amount: z.number(),
    })
  ),
  payments: z.array(
    z.object({
      id: idSchema,
      fromId: memberIdSchema,
      fromName: z.string(),
      toId: memberIdSchema,
      toName: z.string(),
      amount: z.number(),
      note: z.string().nullable(),
      createdAt: z.iso.datetime(),
    })
  ),
});
export type MobileUser = z.infer<typeof userSchema>;
export type MobileTrip = z.infer<typeof tripSchema>;
export type MobileExpense = z.infer<typeof expenseSchema>;
export type MobileExpenseDetail = z.infer<typeof expenseDetailSchema>;
export type MobileSettlement = z.infer<typeof settlementSchema>;
