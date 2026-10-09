import { baseCurrency } from '@/api/ledger';
import {
  expenseEditContextSchema,
  expenseUpdateInput,
  expensePreviewSchema,
  expensePreviewInput,
  type ExpenseEditContext,
  type ExpenseUpdateInput,
  type MobileExpensePreview,
} from '@/api/contracts';
import { parseAmount, parseRate } from './input';
import type { EntryRequest } from './entry';
import { expensePreviewV2Schema } from '@travel-budget/contracts';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import { splitInputOf, type SplitMode } from './splitInput';
export type EditMode = 'basic' | 'equal' | 'split';
export interface EditFields {
  splitMode?: SplitMode;
  splitValues?: ExpenseDraft['splitValues'];
  description: string;
  category: string | null;
  date: string;
  amountText: string;
  currency: string;
  rateText: string;
  payerId: string | null;
  memberIds: string[];
}
export const editFields = (context: ExpenseEditContext): EditFields => ({
  description: context.expense.description,
  category: context.category,
  date: context.expense.date,
  amountText: String(context.expense.originalAmount),
  currency: context.expense.currency,
  rateText: String(context.expense.exchangeRate),
  payerId: context.expense.payerId,
  memberIds: context.expense.splits.map((s) => s.userId ?? ''),
});
export const editDraft = (fields: EditFields): ExpenseDraft => ({ ...fields, category: 'other' });
export const canSplitEdit = (context: ExpenseEditContext, mode?: SplitMode) =>
  !!context.ledger &&
  (mode
    ? !!context.capabilities.splitModes?.includes(mode) &&
      !!context.options.splitPreviewModes?.includes(mode)
    : !!context.capabilities.splitModes?.some((m) =>
        context.options.splitPreviewModes?.includes(m)
      ));
export const canRecalculate = (context: ExpenseEditContext) =>
  context.capabilities.recalculate ?? context.capabilities.equal;
const descriptionChanged = (before: string, after: string) =>
  after !== before && after.trim() !== before;

/** After explicit conflict review, carry only edits relative to the previous baseline. */
export function rebaseEditFields(
  previous: ExpenseEditContext,
  fields: EditFields,
  latest: ExpenseEditContext,
  mode: EditMode = 'basic'
): EditFields {
  const baseline = editFields(previous);
  const next = editFields(latest);
  if (descriptionChanged(baseline.description, fields.description))
    next.description = fields.description;
  if (fields.category !== baseline.category) next.category = fields.category;
  if (fields.date !== baseline.date) next.date = fields.date;
  const amount = parseAmount(fields.amountText, fields.currency, baseCurrency(previous));
  // Original amount, currency and rate describe one monetary input. Keeping just
  // one part would silently reinterpret it using a collaborator's other parts.
  const amountChanged =
    fields.amountText !== baseline.amountText &&
    (!amount.ok || amount.amount !== previous.expense.originalAmount);
  const rateChanged =
    fields.rateText !== baseline.rateText &&
    parseRate(fields.rateText) !== previous.expense.exchangeRate;
  if (mode === 'split' || amountChanged || fields.currency !== baseline.currency || rateChanged) {
    next.amountText = fields.amountText;
    next.currency = fields.currency;
    next.rateText = fields.rateText;
  }
  if (mode === 'split' || fields.payerId !== baseline.payerId) next.payerId = fields.payerId;
  if (
    mode === 'split' ||
    [...fields.memberIds].sort().join(',') !== [...baseline.memberIds].sort().join(',')
  )
    next.memberIds = [...fields.memberIds];
  if (fields.splitMode !== undefined) next.splitMode = fields.splitMode;
  if (fields.splitValues !== undefined) next.splitValues = fields.splitValues;
  return next;
}
const dummyKey = '00000000-0000-4000-8000-000000000000';
/** Only changed metadata is sent. Raw unknown categories and historical DTO defaults stay untouched. */
export function editChanges(
  context: ExpenseEditContext,
  fields: EditFields,
  mode: EditMode,
  preview?: MobileExpensePreview
): Omit<ExpenseUpdateInput, 'client_request_id' | 'expected_revision'> | null {
  const changes: Record<string, unknown> = {};
  if (descriptionChanged(context.expense.description, fields.description))
    changes.description = fields.description.trim();
  if (fields.category !== context.category) changes.category = fields.category;
  if (fields.date !== context.expense.date) changes.date = fields.date;
  if (mode !== 'basic') {
    const amount = parseAmount(fields.amountText, fields.currency, baseCurrency(context));
    const known = new Set(context.options.members.map((m) => m.id));
    if (
      (mode === 'split'
        ? !fields.splitMode || !canSplitEdit(context, fields.splitMode)
        : !canRecalculate(context)) ||
      (context.options.supportedCurrencies &&
        !context.options.supportedCurrencies.includes(fields.currency)) ||
      !parseRate(fields.rateText) ||
      (fields.currency === baseCurrency(context) && parseRate(fields.rateText) !== 1) ||
      !amount.ok ||
      !fields.payerId ||
      !known.has(fields.payerId) ||
      fields.memberIds.some((id) => !known.has(id)) ||
      !preview ||
      !expensePreviewSchema.safeParse(preview).success ||
      baseCurrency(preview) !== baseCurrency(context) ||
      (fields.currency === baseCurrency(context) && preview.amount !== amount.amount) ||
      (fields.currency !== baseCurrency(context) &&
        (preview.originalAmount !== amount.amount ||
          preview.currency !== fields.currency ||
          preview.exchangeRate !== parseRate(fields.rateText))) ||
      (preview.currency !== undefined &&
        (preview.currency !== fields.currency ||
          preview.originalAmount !== amount.amount ||
          preview.exchangeRate !== parseRate(fields.rateText))) ||
      [...fields.memberIds].sort().join(',') !==
        preview.splits
          .map((s) => s.userId)
          .sort()
          .join(',')
    )
      throw new Error('INVALID_EDIT');
    if (mode === 'split') {
      const split = splitInputOf(
        editDraft(fields),
        preview.splits.map((s) => s.userId)
      );
      if (
        !split ||
        !expensePreviewV2Schema.safeParse(preview).success ||
        preview.splitMode !== fields.splitMode
      )
        throw new Error('INVALID_EDIT');
      changes.split = split;
    } else if (preview.splitMode !== undefined) throw new Error('INVALID_EDIT');
    Object.assign(changes, {
      original_amount: amount.amount,
      ...(mode === 'split' ||
      context.capabilities.recalculate !== undefined ||
      fields.currency !== baseCurrency(context)
        ? { currency: fields.currency, exchange_rate: parseRate(fields.rateText) }
        : {}),
      payer_id: fields.payerId,
      splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
    });
  }
  if (Object.keys(changes).length === 0) return null;
  const parsed = expenseUpdateInput.parse({
    ...(context.ledger ? { base_currency: baseCurrency(context) } : {}),
    client_request_id: dummyKey,
    expected_revision: context.revision,
    mode,
    changes,
  });
  return {
    ...('base_currency' in parsed ? { base_currency: parsed.base_currency } : {}),
    mode: parsed.mode,
    changes: parsed.changes,
  } as Omit<ExpenseUpdateInput, 'client_request_id' | 'expected_revision'>;
}
export interface PreparedEdit {
  context: ExpenseEditContext;
  changes: ReturnType<typeof editChanges>;
  preview: MobileExpensePreview | null;
}
/** Refresh members/version before confirmation and again after preview; never silently adopts a change. */
export async function prepareEdit(
  request: EntryRequest,
  accountId: string,
  tripId: string,
  expenseId: string,
  context: ExpenseEditContext,
  fields: EditFields,
  mode: EditMode,
  beforeSend: () => void
): Promise<PreparedEdit> {
  const path = `/trips/${tripId}/expenses/${expenseId}/edit-context`;
  const current = await request(accountId, path, expenseEditContextSchema, { beforeSend });
  beforeSend();
  if (current.revision !== context.revision || baseCurrency(current) !== baseCurrency(context))
    return { context: current, changes: null, preview: null };
  let preview: MobileExpensePreview | null = null;
  if (mode !== 'basic') {
    const amount = parseAmount(fields.amountText, fields.currency, baseCurrency(context));
    const rate = parseRate(fields.rateText);
    const split = mode === 'split' ? splitInputOf(editDraft(fields), fields.memberIds) : undefined;
    if (
      !amount.ok ||
      !rate ||
      (mode === 'split'
        ? !fields.splitMode || !split || !canSplitEdit(current, fields.splitMode)
        : !canRecalculate(current))
    )
      throw new Error('INVALID_EDIT');
    const body = expensePreviewInput.parse(
      current.ledger
        ? {
            base_currency: baseCurrency(current),
            amount: amount.amount,
            currency: fields.currency,
            exchange_rate: rate,
            member_ids: fields.memberIds,
            ...(split ? { split } : {}),
          }
        : fields.currency === baseCurrency(context)
          ? { amount: amount.amount, member_ids: fields.memberIds }
          : {
              amount: amount.amount,
              currency: fields.currency,
              exchange_rate: rate,
              member_ids: fields.memberIds,
            }
    );
    preview = await request(accountId, `/trips/${tripId}/expenses/preview`, expensePreviewSchema, {
      method: 'POST',
      body,
      beforeSend,
    });
    const fresh = await request(accountId, path, expenseEditContextSchema, { beforeSend });
    beforeSend();
    if (fresh.revision !== current.revision || baseCurrency(fresh) !== baseCurrency(current))
      return { context: fresh, changes: null, preview: null };
    // Capabilities may change without an expense revision (e.g. a deployment).
    return { context: fresh, changes: editChanges(fresh, fields, mode, preview), preview };
  }
  return {
    context: current,
    changes: editChanges(current, fields, mode, preview ?? undefined),
    preview,
  };
}
