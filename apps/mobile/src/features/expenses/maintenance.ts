import {
  expenseEditContextSchema,
  expenseUpdateInput,
  expensePreviewSchema,
  expensePreviewInput,
  type ExpenseEditContext,
  type ExpenseUpdateInput,
  type MobileExpensePreview,
} from '@travel-budget/contracts';
import { parseAmount, parseRate } from './input';
import type { EntryRequest } from './entry';
export interface EditFields {
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
  memberIds: context.expense.splits.flatMap((s) => (s.userId ? [s.userId] : [])),
});
export const canRecalculate = (context: ExpenseEditContext) =>
  context.capabilities.recalculate ?? context.capabilities.equal;
const descriptionChanged = (before: string, after: string) =>
  after !== before && after.trim() !== before;

/** After explicit conflict review, carry only edits relative to the previous baseline. */
export function rebaseEditFields(
  previous: ExpenseEditContext,
  fields: EditFields,
  latest: ExpenseEditContext
): EditFields {
  const baseline = editFields(previous);
  const next = editFields(latest);
  if (descriptionChanged(baseline.description, fields.description))
    next.description = fields.description;
  if (fields.category !== baseline.category) next.category = fields.category;
  if (fields.date !== baseline.date) next.date = fields.date;
  const amount = parseAmount(fields.amountText, fields.currency);
  if (
    fields.amountText !== baseline.amountText &&
    (!amount.ok || amount.amount !== previous.expense.originalAmount)
  )
    next.amountText = fields.amountText;
  if (fields.currency !== baseline.currency) {
    next.currency = fields.currency;
    next.rateText = fields.rateText;
  } else if (
    fields.rateText !== baseline.rateText &&
    parseRate(fields.rateText) !== previous.expense.exchangeRate
  ) {
    next.currency = fields.currency;
    next.rateText = fields.rateText;
  }
  if (fields.payerId !== baseline.payerId) next.payerId = fields.payerId;
  if ([...fields.memberIds].sort().join(',') !== [...baseline.memberIds].sort().join(','))
    next.memberIds = [...fields.memberIds];
  return next;
}
const dummyKey = '00000000-0000-4000-8000-000000000000';
/** Only changed metadata is sent. Raw unknown categories and historical DTO defaults stay untouched. */
export function editChanges(
  context: ExpenseEditContext,
  fields: EditFields,
  mode: 'basic' | 'equal',
  preview?: MobileExpensePreview
): Omit<ExpenseUpdateInput, 'client_request_id' | 'expected_revision'> | null {
  const changes: Record<string, unknown> = {};
  if (descriptionChanged(context.expense.description, fields.description))
    changes.description = fields.description.trim();
  if (fields.category !== context.category) changes.category = fields.category;
  if (fields.date !== context.expense.date) changes.date = fields.date;
  if (mode === 'equal') {
    const amount = parseAmount(fields.amountText, fields.currency);
    const known = new Set(context.options.members.map((m) => m.id));
    if (
      !canRecalculate(context) ||
      (context.options.supportedCurrencies &&
        !context.options.supportedCurrencies.includes(fields.currency)) ||
      !parseRate(fields.rateText) ||
      (fields.currency === 'TWD' && parseRate(fields.rateText) !== 1) ||
      !amount.ok ||
      !fields.payerId ||
      !known.has(fields.payerId) ||
      fields.memberIds.some((id) => !known.has(id)) ||
      !preview ||
      !expensePreviewSchema.safeParse(preview).success ||
      (fields.currency === 'TWD' && preview.amount !== amount.amount) ||
      (fields.currency !== 'TWD' &&
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
    Object.assign(changes, {
      original_amount: amount.amount,
      ...(context.capabilities.recalculate !== undefined || fields.currency !== 'TWD'
        ? { currency: fields.currency, exchange_rate: parseRate(fields.rateText) }
        : {}),
      payer_id: fields.payerId,
      splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
    });
  }
  if (Object.keys(changes).length === 0) return null;
  const parsed = expenseUpdateInput.parse({
    client_request_id: dummyKey,
    expected_revision: context.revision,
    mode,
    changes,
  });
  return { mode: parsed.mode, changes: parsed.changes } as Omit<
    ExpenseUpdateInput,
    'client_request_id' | 'expected_revision'
  >;
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
  mode: 'basic' | 'equal',
  beforeSend: () => void
): Promise<PreparedEdit> {
  const path = `/trips/${tripId}/expenses/${expenseId}/edit-context`;
  const current = await request(accountId, path, expenseEditContextSchema, { beforeSend });
  beforeSend();
  if (current.revision !== context.revision)
    return { context: current, changes: null, preview: null };
  let preview: MobileExpensePreview | null = null;
  if (mode === 'equal') {
    const amount = parseAmount(fields.amountText, fields.currency);
    const rate = parseRate(fields.rateText);
    if (!amount.ok || !rate || !canRecalculate(current)) throw new Error('INVALID_EDIT');
    const body = expensePreviewInput.parse(
      fields.currency === 'TWD'
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
    if (fresh.revision !== current.revision)
      return { context: fresh, changes: null, preview: null };
  }
  return {
    context: current,
    changes: editChanges(current, fields, mode, preview ?? undefined),
    preview,
  };
}
