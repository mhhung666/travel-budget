import { z } from 'zod';

export const RECEIPT_CATEGORIES = [
  'accommodation',
  'transportation',
  'food',
  'shopping',
  'entertainment',
  'tickets',
  'other',
] as const;
export const receiptDraftSchema = z
  .object({
    merchantName: z.string().trim().min(1).max(200).optional(),
    transactionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    amountCandidates: z
      .array(
        z
          .object({
            kind: z.enum(['total', 'subtotal', 'tax', 'service', 'tip', 'unknown']),
            amount: z.number().positive().finite().max(10_000_000),
          })
          .strict()
      )
      .max(12),
    suggestedCategory: z.enum(RECEIPT_CATEGORIES).optional(),
    fieldStatus: z
      .object({
        merchantName: z.enum(['read', 'missing', 'ambiguous']),
        transactionDate: z.enum(['read', 'missing', 'ambiguous']),
        currency: z.enum(['read', 'missing', 'ambiguous']),
        total: z.enum(['read', 'missing', 'ambiguous']),
      })
      .strict(),
    warnings: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z_]{2,60}$/),
            field: z.enum(['merchantName', 'transactionDate', 'currency', 'total']).optional(),
          })
          .strict()
      )
      .max(20),
  })
  .strict();

export const receiptDraftRequestSchema = z
  .object({ tripId: z.string().trim().min(1).max(100), key: z.string().trim().min(1).max(500) })
  .strict();
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
