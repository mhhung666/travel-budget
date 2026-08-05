import { z } from 'zod';
import { CATEGORIES } from '@/lib/validation';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const name = z.string().trim().min(1).max(100);
const split = z.discriminatedUnion('method', [
  z.object({ method: z.literal('equal'), participantNames: z.array(name).max(30) }).strict(),
  z
    .object({
      method: z.literal('amount'),
      shares: z
        .array(z.object({ memberName: name, amount: z.number().positive().finite() }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      method: z.literal('percentage'),
      shares: z
        .array(z.object({ memberName: name, percentage: z.number().positive().max(100) }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
  z
    .object({
      method: z.literal('ratio'),
      shares: z
        .array(z.object({ memberName: name, units: z.number().positive().max(10_000) }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
]);

export const expenseTextDraftSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    originalAmount: z.number().positive().finite().max(10_000_000),
    date: date.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    payerName: name.optional(),
    category: z.enum(CATEGORIES).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    itineraryDate: date.optional(),
    split,
    warnings: z.array(z.object({ code: z.string().regex(/^[A-Z_]{2,60}$/) }).strict()).max(20),
  })
  .strict();
export const expenseTextDraftRequestSchema = z
  .object({
    tripId: z.string().trim().min(1).max(100),
    sourceText: z.string().trim().min(1).max(3_000),
  })
  .strict();
export type ExpenseTextDraft = z.infer<typeof expenseTextDraftSchema>;
