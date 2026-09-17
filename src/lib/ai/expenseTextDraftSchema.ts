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

// OpenAI strict output uses required nullable fields and anyOf for the mutually exclusive splits.
export const openAIExpenseTextDraftSchema = expenseTextDraftSchema.extend({
  date: expenseTextDraftSchema.shape.date.unwrap().nullable(),
  currency: expenseTextDraftSchema.shape.currency.unwrap().nullable(),
  payerName: expenseTextDraftSchema.shape.payerName.unwrap().nullable(),
  category: expenseTextDraftSchema.shape.category.unwrap().nullable(),
  tags: expenseTextDraftSchema.shape.tags.unwrap().nullable(),
  itineraryDate: expenseTextDraftSchema.shape.itineraryDate.unwrap().nullable(),
  split: z.union(split.options),
});

export function parseOpenAIExpenseTextDraft(value: unknown): ExpenseTextDraft {
  const draft = openAIExpenseTextDraftSchema.parse(value);
  return expenseTextDraftSchema.parse(
    Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== null))
  );
}
