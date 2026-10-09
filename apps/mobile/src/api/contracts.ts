import { z } from 'zod';
import { sessionSchema as sharedSessionSchema } from '@travel-budget/contracts';
import * as shared from '@travel-budget/contracts';

export {
  BudgetContext,
  BudgetInput,
  BudgetFields,
  BudgetMutationResult,
  budgetFieldsSchema,
  budgetV2Input,
  budgetContextV2Schema,
  budgetMutationResultV2Schema,
  CurrencySettings,
  ExpenseMutationResult,
  Ledger,
  MAX_EXPENSE_AMOUNT,
  MAX_EXPENSE_DESCRIPTION,
  MemberMutationResult,
  PaymentCreateInput,
  PaymentDeleteInput,
  PaymentMutationResult,
  ReferenceRates,
  TripAccessContext,
  TripAccessInput,
  TripAccessResult,
  TripArchiveInput,
  TripCurrencyInput,
  TripManagementResult,
  TripMembers,
  TripMutationResult,
  TripSettings,
  TripUpdateInput,
  currencySettingsSchema,
  dateSchema,
  expenseCategories,
  expenseDeleteInput,
  expenseDeleteV2Input,
  expenseMutationResultSchema,
  expenseUpdateV2Input,
  idSchema,
  invitationSchema,
  inviteCodeSchema,
  isCentShare,
  isPositiveCentAmount,
  ledgerCapabilitiesSchema,
  ledgerSchema,
  memberClaimInvitationSchema,
  memberMutationResultSchema,
  mutationRequestV2Schema,
  passwordResetAcceptedSchema,
  passwordResetInput,
  passwordResetRequestInput,
  passwordResetResultSchema,
  paymentCreateInput,
  paymentCreateV2Input,
  paymentDeleteInput,
  paymentDeleteV2Input,
  paymentFieldsSchema,
  paymentMutationResultSchema,
  referenceRatesSchema,
  registerInput,
  tripAccessContextSchema,
  tripAccessInput,
  tripAccessResultSchema,
  tripArchiveInput,
  tripChangesSchema,
  tripCreateInput,
  tripCreateV2Input,
  tripCurrencyInput,
  tripCurrencyV2Input,
  tripFieldsSchema,
  tripJoinInput,
  tripLocationSchema,
  tripManagementResultSchema,
  tripMembersSchema,
  tripMutationResultSchema,
  tripSettingsSchema,
  tripUpdateInput,
  userSchema,
  virtualMemberCreateInput,
  virtualMemberNameSchema,
  virtualMemberRenameInput,
} from '@travel-budget/contracts';

// Optional units belong only to legacy in-memory fixtures and persisted v1 snapshots.
// The HTTP boundary always chooses the mandatory v2 schema for a v2 request.
const unit = { ledger: shared.ledgerSchema.optional() };
export const tripSchema = shared.tripSchema.safeExtend(unit);
export const landingSchema = shared.landingSchema.safeExtend(unit);
export const expenseSchema = shared.expenseSchema.safeExtend(unit);
export const expenseDetailSchema = shared.expenseDetailSchema.safeExtend(unit);
export const settlementSchema = shared.settlementSchema.safeExtend(unit);
export const expenseOptionsSchema = shared.expenseOptionsSchema.safeExtend({
  ...unit,
  splitPreviewModes: shared.expenseOptionsV2Schema.shape.splitPreviewModes,
  splitCreateModes: shared.expenseOptionsV2Schema.shape.splitCreateModes,
});
export const expensePreviewSchema = shared.expensePreviewSchema.safeExtend({
  ...unit,
  splitMode: shared.expensePreviewV2Schema.shape.splitMode,
  splits: shared.expensePreviewV2Schema.shape.splits,
});
export const expenseEditContextSchema = shared.expenseEditContextSchema.safeExtend({
  ...unit,
  capabilities: shared.expenseEditContextV2Schema.shape.capabilities,
  expense: expenseDetailSchema,
  options: expenseOptionsSchema,
});
export const paymentContextSchema = shared.paymentContextSchema.safeExtend({
  ...unit,
  settlement: settlementSchema,
});
export const paymentRevokeContextSchema = shared.paymentRevokeContextSchema.safeExtend(unit);
export const tripCurrencyContextSchema = shared.tripCurrencyContextSchema.safeExtend(unit);
export const tripsSchema = shared.tripsSchema.safeExtend({ items: z.array(tripSchema) });
export const expensesSchema = shared.expensesSchema.safeExtend({
  ...unit,
  items: z.array(expenseSchema),
});
export const expenseCreateInput = z.union([shared.expenseCreateV2Input, shared.expenseCreateInput]);
export const expensePreviewInput = z.union([
  shared.expensePreviewV2Input,
  shared.expensePreviewInput,
]);
export const expenseUpdateInput = z.union([shared.expenseUpdateV2Input, shared.expenseUpdateInput]);
export const expenseRequestSchema = z.union([
  shared.expenseRequestV2Schema,
  shared.expenseRequestSchema,
]);
export const mutationRequestSchema = z.union([
  shared.mutationRequestV2Schema,
  shared.mutationRequestSchema,
]);
export type User = shared.MobileUser;
export type Trip = z.infer<typeof tripSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseDetail = z.infer<typeof expenseDetailSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type ExpenseOptions = z.infer<typeof expenseOptionsSchema>;
export type ExpensePreviewInput = z.infer<typeof expensePreviewInput>;
export type ExpensePreview = z.infer<typeof expensePreviewSchema>;
export type ExpenseCreateInput = z.infer<typeof expenseCreateInput>;
export type ExpenseRequest = z.infer<typeof expenseRequestSchema>;
export type ExpenseEditContext = z.infer<typeof expenseEditContextSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateInput>;
export type MobileExpensePreview = ExpensePreview;
export type PaymentContext = z.infer<typeof paymentContextSchema>;
export type PaymentRevokeContext = z.infer<typeof paymentRevokeContextSchema>;
export type TripCurrencyContext = z.infer<typeof tripCurrencyContextSchema>;
export type MutationRequest = z.infer<typeof mutationRequestSchema>;

// Maps a shared schema to its v2 response form (v1 was retired in B5d-1); no HTTP schemas are copied.
export function responseSchema<T>(schema: z.ZodType<T>): z.ZodType<T> {
  const pairs: [z.ZodType, z.ZodType][] = [
    [tripSchema, shared.tripV2Schema],
    [tripsSchema, shared.tripsV2Schema],
    [landingSchema, shared.landingV2Schema],
    [expenseSchema, shared.expenseV2Schema],
    [expensesSchema, shared.expensesV2Schema],
    [expenseDetailSchema, shared.expenseDetailV2Schema],
    [settlementSchema, shared.settlementV2Schema],
    [expenseOptionsSchema, shared.expenseOptionsV2Schema],
    [expensePreviewSchema, shared.expensePreviewV2Schema],
    [expenseRequestSchema, shared.expenseRequestV2Schema],
    [expenseEditContextSchema, shared.expenseEditContextV2Schema],
    [paymentContextSchema, shared.paymentContextV2Schema],
    [paymentRevokeContextSchema, shared.paymentRevokeContextV2Schema],
    [tripCurrencyContextSchema, shared.tripCurrencyContextV2Schema],
    [mutationRequestSchema, shared.mutationRequestV2Schema],
  ];
  for (const [name, v2] of Object.entries(shared.v2Schemas)) {
    if (name === 'V2Ledger' || name === 'V2Capabilities' || name.endsWith('Input')) continue;
    const stem = name.slice(2);
    const key = stem[0].toLowerCase() + stem.slice(1) + 'Schema';
    const original = (shared as unknown as Record<string, z.ZodType>)[key];
    if (original) pairs.push([original, v2]);
  }
  return (pairs.find(([old]) => old === schema)?.[1] ?? schema) as z.ZodType<T>;
}

// Preserve the client's existing rejection of empty credentials.
export const sessionSchema = sharedSessionSchema.extend({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type Session = z.infer<typeof sessionSchema>;
