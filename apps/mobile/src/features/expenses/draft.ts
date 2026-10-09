import { expensePreviewV2Schema } from '@travel-budget/contracts';
import { splitInputOf, splitModeOf, supportsSplitCreate } from './splitInput';
import { baseCurrency, ledgerOf } from '@/api/ledger';
import {
  MAX_EXPENSE_DESCRIPTION,
  expensePreviewSchema,
  type ExpenseCreateInput,
  type ExpenseOptions,
  type ExpensePreview,
  type ExpensePreviewInput,
} from '@/api/contracts';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import { isCalendarDate, parseAmount, parseRate } from './input';

/** What a user-confirmed submission carries before it receives its request id. */
type WithoutRequestId<T> = T extends unknown ? Omit<T, 'client_request_id'> : never;
export type ExpenseFields = WithoutRequestId<ExpenseCreateInput>;

export type { ExpenseDraft } from '@/storage/expenseDrafts';

export type DraftIssue =
  | { field: 'split'; code: 'invalid' | 'unsupported' }
  | { field: 'currency'; code: 'mismatch' }
  | { field: 'description'; code: 'required' | 'tooLong' }
  | { field: 'amount'; code: 'empty' | 'format' | 'zero' | 'tooLarge' }
  | { field: 'currency' | 'rate'; code: 'invalid' }
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
    ...currencyDefaults(options),
    category: 'food',
    date: today,
    payerId: userId && ids.includes(userId) ? userId : (ids[0] ?? null),
    memberIds: ids,
  };
}

export function validateDraft(draft: ExpenseDraft, options: ExpenseOptions): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!splitInputOf(draft, draft.memberIds) && draft.memberIds.length)
    issues.push({ field: 'split', code: 'invalid' });
  if (splitModeOf(draft) !== 'equal' && !supportsSplitCreate(options, splitModeOf(draft)))
    issues.push({ field: 'split', code: 'unsupported' });
  if (baseCurrency(draft) !== baseCurrency(options))
    issues.push({ field: 'currency', code: 'mismatch' });
  const description = draft.description.trim();
  if (!description) issues.push({ field: 'description', code: 'required' });
  else if (description.length > MAX_EXPENSE_DESCRIPTION)
    issues.push({ field: 'description', code: 'tooLong' });
  const amount = parseAmount(
    draft.amountText,
    draft.currency ?? baseCurrency(draft),
    baseCurrency(options)
  );
  if (!amount.ok) issues.push({ field: 'amount', code: amount.reason });
  if (
    !/^[A-Z]{3}$/.test(draft.currency ?? 'TWD') ||
    (options.supportedCurrencies && !options.supportedCurrencies.includes(draft.currency ?? 'TWD'))
  )
    issues.push({ field: 'currency', code: 'invalid' });
  if (draftRate(draft) === null) issues.push({ field: 'rate', code: 'invalid' });
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
  const amount = parseAmount(
    draft.amountText,
    draft.currency ?? baseCurrency(draft),
    baseCurrency(options)
  );
  const chosen = new Set(draft.memberIds);
  const member_ids = options.members.filter((member) => chosen.has(member.id)).map((m) => m.id);
  const rate = draftRate(draft);
  const split = splitInputOf(draft, member_ids);
  const explicit = supportsSplitCreate(options, splitModeOf(draft));
  if (!split || (split.mode !== 'equal' && !explicit)) return null;
  return baseCurrency(draft) === baseCurrency(options) &&
    amount.ok &&
    rate !== null &&
    member_ids.length > 0 &&
    draft.memberIds.every((id) => options.members.some((m) => m.id === id))
    ? {
        amount: amount.amount,
        member_ids,
        ...(explicit ? { split } : {}),
        ...(options.ledger
          ? {
              base_currency: baseCurrency(options),
              currency: draft.currency ?? baseCurrency(options),
              exchange_rate: rate,
            }
          : {}),
        ...(draft.currency && draft.currency !== baseCurrency(options)
          ? { currency: draft.currency, exchange_rate: rate }
          : {}),
      }
    : null;
}

/** Identifies what a preview was computed for; any change to amount, currency, rate or members makes it stale. */
export const previewKey = (request: ExpensePreviewInput) =>
  `${'base_currency' in request ? request.base_currency : 'TWD'}|${request.amount}|${'currency' in request ? request.currency : 'TWD'}|${'exchange_rate' in request ? request.exchange_rate : 1}|${request.member_ids.join(',')}|${JSON.stringify('split' in request ? request.split : undefined)}`;

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
  if (!expensePreviewSchema.safeParse(preview).success) throw new Error('STALE_PREVIEW');
  const explicit = 'split' in request && request.split !== undefined;
  if (
    explicit &&
    (!expensePreviewV2Schema.safeParse(preview).success ||
      preview.splitMode !== request.split!.mode)
  )
    throw new Error('STALE_PREVIEW');
  if (!explicit && preview.splitMode !== undefined) throw new Error('STALE_PREVIEW');
  const shared = preview.splits.map((split) => split.userId).sort();
  if (
    baseCurrency(preview) !== baseCurrency(options) ||
    ('currency' in request
      ? preview.originalAmount !== request.amount ||
        preview.currency !== request.currency ||
        preview.exchangeRate !== request.exchange_rate
      : preview.amount !== request.amount) ||
    shared.join(',') !== [...request.member_ids].sort().join(',')
  )
    throw new Error('STALE_PREVIEW');
  return {
    ...(options.ledger ? { base_currency: baseCurrency(options) } : {}),
    ...(explicit
      ? {
          split: splitInputOf(
            draft,
            preview.splits.map((s) => s.userId)
          )!,
        }
      : {}),
    payer_id: draft.payerId,
    original_amount: request.amount,
    currency: draft.currency ?? 'TWD',
    exchange_rate: draftRate(draft)!,
    description: draft.description.trim(),
    category: draft.category,
    date: draft.date,
    splits: preview.splits.map((split) => ({
      user_id: split.userId,
      share_amount: split.shareAmount,
    })),
  };
}

export const draftRate = (draft: ExpenseDraft): number | null => {
  if ((draft.currency ?? 'TWD') === baseCurrency(draft))
    return draft.rateText === undefined || parseRate(draft.rateText) === 1 ? 1 : null;
  return parseRate(draft.rateText ?? '');
};
/** Only newly created drafts read these defaults; restoring a saved draft never applies them. */
export function currencyDefaults(
  options: ExpenseOptions,
  currency = options.currencySettings?.default_currency ?? baseCurrency(options)
): Partial<ExpenseDraft> {
  const pinned = options.currencySettings?.currencies.find((c) => c.code === currency)?.rate;
  return {
    ...(options.ledger ? { ledger: ledgerOf(options), apiVersion: 2 as const } : {}),
    currency,
    rateText: currency === baseCurrency(options) ? '1' : pinned == null ? '' : String(pinned),
    rateSource: 'trip',
    rateDate: undefined,
  };
}
export function draftCurrencies(options: ExpenseOptions, draft: ExpenseDraft): string[] {
  const codes = options.currencySettings?.currencies.map((c) => c.code) ?? [];
  return [
    ...new Set([
      ...(codes.length ? codes : [baseCurrency(options)]),
      baseCurrency(options),
      options.currencySettings?.default_currency ?? baseCurrency(options),
      draft.currency ?? 'TWD',
    ]),
  ];
}
