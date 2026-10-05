import { z } from 'zod';
import { expenseCategories } from '@/api/contracts';
import type { PendingScope } from './pendingExpenses';

/** Raw inputs, deliberately allowing incomplete amounts and dates. No preview or credentials. */
export const expenseDraftSchema = z
  .object({
    description: z.string(),
    amountText: z.string(),
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
