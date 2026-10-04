import { z } from 'zod';
import { sessionSchema as sharedSessionSchema } from '@travel-budget/contracts';

export {
  userSchema,
  tripSchema,
  tripsSchema,
  landingSchema,
  expenseCategories,
  expenseSchema,
  expensesSchema,
  expenseDetailSchema,
  settlementSchema,
  expenseOptionsSchema,
  expensePreviewInput,
  expensePreviewSchema,
  expenseCreateInput,
  expenseRequestSchema,
  clientRequestIdSchema,
  isPositiveCentAmount,
  isCentShare,
  MAX_EXPENSE_AMOUNT,
  MAX_EXPENSE_MEMBERS,
  MAX_EXPENSE_DESCRIPTION,
} from '@travel-budget/contracts';
export type {
  MobileUser as User,
  MobileTrip as Trip,
  MobileExpense as Expense,
  MobileExpenseDetail as ExpenseDetail,
  MobileSettlement as Settlement,
  MobileExpenseOptions as ExpenseOptions,
  MobileExpensePreviewInput as ExpensePreviewInput,
  MobileExpensePreview as ExpensePreview,
  MobileExpenseCreateInput as ExpenseCreateInput,
  MobileExpenseRequest as ExpenseRequest,
} from '@travel-budget/contracts';

// Preserve the client's existing rejection of empty credentials.
export const sessionSchema = sharedSessionSchema.extend({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;
