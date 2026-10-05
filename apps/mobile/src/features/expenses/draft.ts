import {
  MAX_EXPENSE_DESCRIPTION,
  type ExpenseCreateInput,
  type ExpenseOptions,
  type ExpensePreview,
  type ExpensePreviewInput,
} from '@/api/contracts';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import { isCalendarDate, parseAmount } from './input';

/** What a user-confirmed submission carries before it receives its request id. */
export type ExpenseFields = Omit<ExpenseCreateInput, 'client_request_id'>;

export type { ExpenseDraft } from '@/storage/expenseDrafts';

export type DraftIssue =
  | { field: 'description'; code: 'required' | 'tooLong' }
  | { field: 'amount'; code: 'empty' | 'format' | 'zero' | 'tooLarge' }
  | { field: 'date'; code: 'invalid' }
  | { field: 'payer'; code: 'required' }
  | { field: 'members'; code: 'required' | 'changed' }
  | { field: 'category'; code: 'required' };

/** The person adding the expense pays by default and everyone shares it. */
export function newDraft(
  options: ExpenseOptions,
  userId: string | undefined,
  today: string
): ExpenseDraft {
  const ids = options.members.map((member) => member.id);
  return {
    description: '',
    amountText: '',
    category: 'food',
    date: today,
    payerId: userId && ids.includes(userId) ? userId : (ids[0] ?? null),
    memberIds: ids,
  };
}

export function validateDraft(draft: ExpenseDraft, options: ExpenseOptions): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const description = draft.description.trim();
  if (!description) issues.push({ field: 'description', code: 'required' });
  else if (description.length > MAX_EXPENSE_DESCRIPTION)
    issues.push({ field: 'description', code: 'tooLong' });
  const amount = parseAmount(draft.amountText);
  if (!amount.ok) issues.push({ field: 'amount', code: amount.reason });
  if (!isCalendarDate(draft.date)) issues.push({ field: 'date', code: 'invalid' });
  const ids = new Set(options.members.map((member) => member.id));
  if (!draft.payerId || !ids.has(draft.payerId)) issues.push({ field: 'payer', code: 'required' });
  if (!options.categories.includes(draft.category))
    issues.push({ field: 'category', code: 'required' });
  if (draft.memberIds.some((id) => !ids.has(id)))
    issues.push({ field: 'members', code: 'changed' });
  else if (draft.memberIds.length === 0) issues.push({ field: 'members', code: 'required' });
  return issues;
}

/** The preview request for a valid draft; members follow the options order the backend splits by. */
export function previewInputOf(
  draft: ExpenseDraft,
  options: ExpenseOptions
): ExpensePreviewInput | null {
  const amount = parseAmount(draft.amountText);
  const chosen = new Set(draft.memberIds);
  const member_ids = options.members.filter((member) => chosen.has(member.id)).map((m) => m.id);
  return amount.ok &&
    member_ids.length > 0 &&
    draft.memberIds.every((id) => options.members.some((m) => m.id === id))
    ? { amount: amount.amount, member_ids }
    : null;
}

/** Identifies what a preview was computed for; any change to amount or members makes it stale. */
export const previewKey = (request: ExpensePreviewInput) =>
  `${request.amount}|${request.member_ids.join(',')}`;

/**
 * The frozen body of a confirmed submission. The shares are the backend's preview, sent as
 * returned; a preview that does not belong to this draft is refused rather than adjusted.
 */
export function confirmedFields(
  draft: ExpenseDraft,
  options: ExpenseOptions,
  preview: ExpensePreview
): ExpenseFields {
  const request = previewInputOf(draft, options);
  const issues = validateDraft(draft, options);
  if (!request || issues.length > 0 || !draft.payerId) throw new Error('INVALID_DRAFT');
  const shared = preview.splits.map((split) => split.userId).sort();
  if (
    preview.amount !== request.amount ||
    shared.join(',') !== [...request.member_ids].sort().join(',')
  )
    throw new Error('STALE_PREVIEW');
  return {
    payer_id: draft.payerId,
    original_amount: request.amount,
    currency: 'TWD',
    exchange_rate: 1,
    description: draft.description.trim(),
    category: draft.category,
    date: draft.date,
    splits: preview.splits.map((split) => ({
      user_id: split.userId,
      share_amount: split.shareAmount,
    })),
  };
}
