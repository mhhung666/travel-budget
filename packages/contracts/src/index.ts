import { z } from 'zod';

export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const dateSchema = z.iso.date();
export const loginInput = z
  .object({ username: z.string().min(1).max(200), password: z.string().min(1).max(1024) })
  .strict();
// UTF-8 length without relying on a native TextEncoder implementation.
export function passwordBytes(value: string): number {
  return Array.from(value).reduce((size, char) => {
    const code = char.codePointAt(0)!;
    return size + (code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4);
  }, 0);
}
export const newPasswordSchema = z
  .string()
  .min(6)
  .max(72)
  .refine((s) => passwordBytes(s) <= 72);
const accountEmail = z.string().trim().toLowerCase().email().max(254);
export const registerInput = z
  .object({
    username: z.string().trim().min(3).max(200),
    display_name: z.string().trim().min(1).max(100),
    email: accountEmail,
    password: newPasswordSchema,
  })
  .strict();
export const passwordResetRequestInput = z
  .object({
    email: accountEmail,
    locale: z.enum(['zh', 'zh-CN', 'en', 'jp']).optional(),
  })
  .strict();
export const passwordResetInput = z
  .object({
    email: accountEmail,
    code: z.string().regex(/^\d{6}$/),
    new_password: newPasswordSchema,
  })
  .strict();
export const passwordResetAcceptedSchema = z.object({ accepted: z.literal(true) }).strict();
export const passwordResetResultSchema = z.object({ reset: z.literal(true) }).strict();
export type RegisterInput = z.infer<typeof registerInput>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestInput>;
export type PasswordResetInput = z.infer<typeof passwordResetInput>;
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
// Online expense entry. This round supports TWD only, rate 1, and members chosen for an equal split.
export const MAX_EXPENSE_MEMBERS = 100;
export const MAX_EXPENSE_DESCRIPTION = 200;
/**
 * Largest TWD amount (and share) one new expense may carry. The backend's shared cent rounding adds
 * a tolerance proportional to the amount, so from about 8.8e12 (2^43) it no longer returns a value
 * on the cent grid unchanged: 10_000_000_000_000 becomes 10_000_000_000_000.01 and every further
 * rounding adds another cent. Staying thousands of times below that keeps preview, stored amount,
 * response and split sums identical to the cent. It is far above any real expense.
 */
export const MAX_EXPENSE_AMOUNT = 1_000_000_000;
// A TWD amount fits the cent grid when it is finite, within MAX_EXPENSE_AMOUNT and has at most two
// decimals: 33.34 passes; 33.345, 1e21 and 1_000_000_000.01 do not.
function onCentGrid(value: number): boolean {
  if (!Number.isFinite(value) || value > MAX_EXPENSE_AMOUNT) return false;
  return Math.round(value * 100) / 100 === value;
}
/** Strictly positive amount of at least 0.01. */
export const isPositiveCentAmount = (value: number) => value >= 0.01 && onCentGrid(value);
/** Share of an amount; 0.00 is a valid share (0.01 split three ways). */
export const isCentShare = (value: number) => value >= 0 && onCentGrid(value);
const centAmount = z
  .number()
  .min(0.01)
  .max(MAX_EXPENSE_AMOUNT)
  .refine(isPositiveCentAmount, 'Use a positive amount with at most two decimals');
const centShare = z
  .number()
  .min(0)
  .max(MAX_EXPENSE_AMOUNT)
  .refine(isCentShare, 'Use a non-negative share with at most two decimals');
const noDuplicates = (values: string[]) => new Set(values).size === values.length;

// Members in the order used to place the leftover cents of an equal split (earliest joined first).
export const expenseOptionsSchema = z.object({
  members: z.array(z.object({ id: idSchema, displayName: z.string() })),
  categories: z.array(expenseCategorySchema),
});
export const expensePreviewInput = z
  .object({
    amount: centAmount,
    member_ids: z
      .array(idSchema)
      .min(1)
      .max(MAX_EXPENSE_MEMBERS)
      .refine(noDuplicates, 'Members must be unique'),
  })
  .strict();
// Shares are returned in expense-options member order whatever order the request used.
export const expensePreviewSchema = z.object({
  amount: z.number(),
  splits: z.array(z.object({ userId: idSchema, displayName: z.string(), shareAmount: z.number() })),
});
// One UUID per user-confirmed submission, reused by every retry of that submission.
export const clientRequestIdSchema = z.uuid();
// Field names mirror the Web expense input; unknown fields (attachments, tags, itinerary days, ...)
// are rejected rather than ignored.
export const expenseCreateInput = z
  .object({
    client_request_id: clientRequestIdSchema,
    payer_id: idSchema,
    original_amount: centAmount,
    currency: z.literal('TWD'),
    exchange_rate: z.literal(1),
    description: z.string().trim().min(1).max(MAX_EXPENSE_DESCRIPTION),
    category: expenseCategorySchema,
    date: dateSchema,
    splits: z
      .array(z.object({ user_id: idSchema, share_amount: centShare }).strict())
      .min(1)
      .max(MAX_EXPENSE_MEMBERS)
      .refine(
        (splits) => noDuplicates(splits.map((split) => split.user_id)),
        'Members must be unique'
      ),
  })
  .strict();
export const expenseRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('committed'), expense: expenseDetailSchema }),
]);
export type MobileUser = z.infer<typeof userSchema>;
export type MobileTrip = z.infer<typeof tripSchema>;
export type MobileExpense = z.infer<typeof expenseSchema>;
export type MobileExpenseDetail = z.infer<typeof expenseDetailSchema>;
export type MobileSettlement = z.infer<typeof settlementSchema>;
export type MobileExpenseOptions = z.infer<typeof expenseOptionsSchema>;
export type MobileExpensePreviewInput = z.infer<typeof expensePreviewInput>;
export type MobileExpensePreview = z.infer<typeof expensePreviewSchema>;
export type MobileExpenseCreateInput = z.infer<typeof expenseCreateInput>;
export type MobileExpenseRequest = z.infer<typeof expenseRequestSchema>;

// E1: online confirmation; one account-scoped UUID survives every retry.
export const tripFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).default(''),
    start_date: dateSchema.nullable().default(null),
    end_date: dateSchema.nullable().default(null),
  })
  .strict()
  .refine((v) => !v.start_date || !v.end_date || v.start_date <= v.end_date, 'Invalid date range');
export const tripCreateInput = tripFieldsSchema.safeExtend({
  client_request_id: clientRequestIdSchema.toLowerCase(),
});
export const inviteCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{6,10}$/);
export const tripJoinInput = z
  .object({
    client_request_id: clientRequestIdSchema.toLowerCase(),
    invite_code: inviteCodeSchema,
  })
  .strict();
export const tripMutationResultSchema = z.object({
  tripId: idSchema,
  alreadyMember: z.boolean().optional(),
});
export const invitationSchema = z.object({ code: inviteCodeSchema, url: z.url() });
// E3: preserve unsupported historical fields; only explicit equal mode changes accounting.
export const resourceRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const basicExpenseChanges = z
  .object({
    description: z.string().trim().min(1).max(MAX_EXPENSE_DESCRIPTION).optional(),
    category: expenseCategorySchema.optional(),
    date: dateSchema.optional(),
  })
  .strict();
const mutationIdentity = {
  client_request_id: clientRequestIdSchema.toLowerCase(),
  expected_revision: resourceRevisionSchema,
};
export const expenseUpdateInput = z.discriminatedUnion('mode', [
  z
    .object({
      ...mutationIdentity,
      mode: z.literal('basic'),
      changes: basicExpenseChanges.refine((v) => Object.keys(v).length > 0, 'No changes'),
    })
    .strict(),
  z
    .object({
      ...mutationIdentity,
      mode: z.literal('equal'),
      changes: basicExpenseChanges
        .extend({
          original_amount: expenseCreateInput.shape.original_amount,
          payer_id: idSchema,
          splits: expenseCreateInput.shape.splits,
        })
        .strict(),
    })
    .strict(),
]);
export const expenseDeleteInput = z.object(mutationIdentity).strict();
export const expenseMutationResultSchema = z
  .object({
    tripId: idSchema,
    expenseId: idSchema,
    revision: resourceRevisionSchema.optional(),
    deleted: z.literal(true).optional(),
  })
  .refine(
    (v) => Boolean(v.revision) !== Boolean(v.deleted),
    'A maintenance result must identify its outcome'
  );
export const expenseEditContextSchema = z.object({
  expense: expenseDetailSchema,
  // The list DTO maps unknown categories to other; an editor must preserve the raw category.
  category: z.string().nullable(),
  options: expenseOptionsSchema,
  revision: resourceRevisionSchema,
  capabilities: z.object({
    basic: z.literal(true),
    equal: z.boolean(),
    reason: z.enum(['foreign', 'historical', 'members']).nullable(),
  }),
});
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateInput>;
export type ExpenseDeleteInput = z.infer<typeof expenseDeleteInput>;
export type ExpenseEditContext = z.infer<typeof expenseEditContextSchema>;
export type ExpenseMutationResult = z.infer<typeof expenseMutationResultSchema>;
// E4: record external payments; suggestions are never a hard upper bound.
export const paymentFieldsSchema = z
  .object({
    from_id: idSchema.toLowerCase(),
    to_id: idSchema.toLowerCase(),
    amount: centAmount,
    note: z.string().trim().max(200).default(''),
  })
  .strict()
  .refine((v) => v.from_id !== v.to_id, { message: '付款人與收款人不能相同', path: ['to_id'] });
export const paymentCreateInput = paymentFieldsSchema.safeExtend(mutationIdentity);
export const paymentDeleteInput = z.object(mutationIdentity).strict();
export const paymentMutationResultSchema = z
  .object({
    tripId: idSchema,
    paymentId: idSchema,
    revision: resourceRevisionSchema.optional(),
    deleted: z.literal(true).optional(),
  })
  .refine((v) => Boolean(v.revision) !== Boolean(v.deleted), 'Payment outcome required');
export const paymentContextSchema = z.object({
  members: expenseOptionsSchema.shape.members,
  settlement: settlementSchema,
  settlementRevision: resourceRevisionSchema,
});
export const paymentRevokeContextSchema = z.object({
  payment: settlementSchema.shape.payments.element,
  revision: resourceRevisionSchema,
});
export type PaymentCreateInput = z.infer<typeof paymentCreateInput>;
export type PaymentDeleteInput = z.infer<typeof paymentDeleteInput>;
export type PaymentContext = z.infer<typeof paymentContextSchema>;
export type PaymentRevokeContext = z.infer<typeof paymentRevokeContextSchema>;
export type PaymentMutationResult = z.infer<typeof paymentMutationResultSchema>;
export const mutationRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('not_found') }),
  z
    .object({
      status: z.literal('committed'),
      operation: z.enum([
        'trip.create',
        'trip.join',
        'expense.update',
        'expense.delete',
        'payment.create',
        'payment.delete',
      ]),
      resourceId: idSchema,
      result: z.union([
        expenseMutationResultSchema.strict(),
        paymentMutationResultSchema.strict(),
        tripMutationResultSchema.strict(),
      ]),
    })
    .refine(
      (v) =>
        v.operation.startsWith('expense.')
          ? 'expenseId' in v.result &&
            v.resourceId === v.result.expenseId &&
            (v.operation === 'expense.update' ? !!v.result.revision : v.result.deleted === true)
          : v.operation.startsWith('payment.')
            ? 'paymentId' in v.result &&
              v.resourceId === v.result.paymentId &&
              (v.operation === 'payment.create' ? !!v.result.revision : v.result.deleted === true)
            : !('expenseId' in v.result) &&
              !('paymentId' in v.result) &&
              v.resourceId === v.result.tripId,
      'Receipt outcome does not match its operation'
    ),
  z.object({
    status: z.literal('rejected'),
    operation: z.enum([
      'trip.create',
      'trip.join',
      'expense.update',
      'expense.delete',
      'payment.create',
      'payment.delete',
    ]),
    code: z.enum([
      'INVITATION_INVALID',
      'RESOURCE_CHANGED',
      'RESOURCE_GONE',
      'VALIDATION_ERROR',
      'SETTLEMENT_CHANGED',
    ]),
    tripId: idSchema.optional(),
  }),
]);
export type TripCreateInput = z.infer<typeof tripCreateInput>;
export type TripJoinInput = z.infer<typeof tripJoinInput>;
export type TripMutationResult = z.infer<typeof tripMutationResultSchema>;
export type MutationRequest = z.infer<typeof mutationRequestSchema>;
