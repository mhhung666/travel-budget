import { z } from 'zod';
import { expenseSplitModeSchema } from '@travel-budget/contracts';
import { expenseCategories, ledgerSchema } from '@/api/contracts';
import type { PendingScope } from './pendingExpenses';

/** Raw inputs, deliberately allowing incomplete amounts and dates. No preview or credentials. */
export const expenseDraftSchema = z
  .object({
    ledger: ledgerSchema.optional(),
    apiVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    description: z.string(),
    amountText: z.string(),
    // Optional fields preserve legacy raw JSON without rewriting old generations or frozen bodies.
    currency: z.string().optional(),
    rateText: z.string().optional(),
    rateSource: z.enum(['manual', 'trip', 'reference']).optional(),
    rateDate: z.string().optional(),
    splitMode: expenseSplitModeSchema.optional(),
    // Keep text per mode and member ID, including incomplete text and deselected members.
    splitValues: z
      .object({
        amount: z.record(z.string(), z.string()).optional(),
        percent: z.record(z.string(), z.string()).optional(),
        shares: z.record(z.string(), z.string()).optional(),
      })
      .strict()
      .optional(),
    category: z.enum(expenseCategories),
    date: z.string(),
    payerId: z.string().nullable(),
    memberIds: z.array(z.string()),
  })
  .strict();
export type ExpenseDraft = z.infer<typeof expenseDraftSchema>;
export interface DraftRef {
  draftId: string;
  revision: number;
}
export interface StoredExpenseDraft extends PendingScope, DraftRef {
  tripId: string;
  input: ExpenseDraft;
  updatedAt: number;
}
export interface ExpenseDraftStore {
  load(scope: PendingScope, tripId: string): Promise<StoredExpenseDraft | null>;
  start(record: StoredExpenseDraft): Promise<void>;
  /** Older revisions and writes to discarded/handed-off generations cannot revive a draft. */
  save(record: StoredExpenseDraft): Promise<boolean>;
  discard(scope: PendingScope, tripId: string, draftId: string): Promise<void>;
}

/** D remains TWD equal only, including every persistence and synchronization entry point. */
export const isTwdQueueDraft = (draft: ExpenseDraft) =>
  (draft.splitMode ?? 'equal') === 'equal' &&
  (draft.ledger?.baseCurrency ?? 'TWD') === 'TWD' &&
  (draft.currency ?? 'TWD') === 'TWD' &&
  (draft.rateText === undefined ||
    (/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(draft.rateText.trim()) && Number(draft.rateText) === 1));
