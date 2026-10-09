import { expenseSplitInput, type expenseSplitModeSchema } from '@travel-budget/contracts';
import type { z } from 'zod';
import type { ExpenseOptions } from '@/api/contracts';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import type { Messages } from '@/i18n/messages';

export type SplitMode = z.infer<typeof expenseSplitModeSchema>;
export type SplitInput = z.infer<typeof expenseSplitInput>;
export const splitModes = ['equal', 'amount', 'percent', 'shares'] as const;
export const splitModeOf = (draft: ExpenseDraft): SplitMode => draft.splitMode ?? 'equal';
export const splitLabel = (mode: SplitMode, t: Messages) =>
  ({ equal: t.splitEqual, amount: t.splitAmount, percent: t.splitPercent, shares: t.splitShares })[
    mode
  ];

/** Lexical validation before shared range/precision checks; blank and zero stay distinct. */
export function splitNumber(text: string, mode: Exclude<SplitMode, 'equal'>) {
  const value = text.trim();
  if (!value) return null;
  const syntax = mode === 'shares' ? /^\d+(\.\d{1,4})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!syntax.test(value)) return undefined;
  const number = Number(value);
  return expenseSplitInput.safeParse({ mode, values: [number] }).success ? number : undefined;
}

/** Align values by ID, both for preview order and for the returned confirmation order. */
export function splitInputOf(draft: ExpenseDraft, ids: string[]): SplitInput | null {
  const mode = splitModeOf(draft);
  if (mode === 'equal') return { mode };
  const values = ids.map((id) => splitNumber(draft.splitValues?.[mode]?.[id] ?? '', mode));
  if (values.some((v) => v === undefined) || !values.some((v) => v === null || v! > 0)) return null;
  const result = expenseSplitInput.safeParse({ mode, values });
  return result.success ? result.data : null;
}

/** Preview alone never authorizes a new write; legacy equal requests remain available. */
export function supportsSplitCreate(options: ExpenseOptions, mode: SplitMode): boolean {
  return (
    !!options.ledger &&
    !!options.splitPreviewModes?.includes(mode) &&
    !!options.splitCreateModes?.includes(mode)
  );
}
