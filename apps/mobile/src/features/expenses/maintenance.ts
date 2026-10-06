import {
  expenseEditContextSchema,
  expenseUpdateInput,
  expensePreviewSchema,
  type ExpenseEditContext,
  type ExpenseUpdateInput,
  type MobileExpensePreview,
} from '@travel-budget/contracts';
import { parseAmount } from './input';
import type { EntryRequest } from './entry';
export interface EditFields {
  description: string;
  category: string | null;
  date: string;
  amountText: string;
  payerId: string | null;
  memberIds: string[];
}
export const editFields = (context: ExpenseEditContext): EditFields => ({
  description: context.expense.description,
  category: context.category,
  date: context.expense.date,
  amountText: String(context.expense.originalAmount),
  payerId: context.expense.payerId,
  memberIds: context.expense.splits.flatMap((s) => (s.userId ? [s.userId] : [])),
});
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
  const amount = parseAmount(fields.amountText);
  if (
    fields.amountText !== baseline.amountText &&
    (!amount.ok || amount.amount !== previous.expense.originalAmount)
  )
    next.amountText = fields.amountText;
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
    const amount = parseAmount(fields.amountText);
    const known = new Set(context.options.members.map((m) => m.id));
    if (
      !context.capabilities.equal ||
      !amount.ok ||
      !fields.payerId ||
      !known.has(fields.payerId) ||
      fields.memberIds.some((id) => !known.has(id)) ||
      !preview ||
      preview.amount !== amount.amount ||
      [...fields.memberIds].sort().join(',') !==
        preview.splits
          .map((s) => s.userId)
          .sort()
          .join(',')
    )
      throw new Error('INVALID_EDIT');
    Object.assign(changes, {
      original_amount: amount.amount,
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
    const amount = parseAmount(fields.amountText);
    if (!amount.ok) throw new Error('INVALID_EDIT');
    preview = await request(accountId, `/trips/${tripId}/expenses/preview`, expensePreviewSchema, {
      method: 'POST',
      body: { amount: amount.amount, member_ids: fields.memberIds },
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
