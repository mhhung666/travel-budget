import { SUPPORTED_CURRENCY_CODES } from '@/constants/currencies';
import { isDraftCalendarDate } from './draftValidation';
import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';

/** Never resolves uncertainty on the user's behalf; only makes invalid claims explicit. */
export function normalizeReceiptDraft(input: ReceiptDraft): ReceiptDraft {
  const draft = receiptDraftSchema.parse(input);
  const warnings = [...draft.warnings];
  const status = { ...draft.fieldStatus };
  if (draft.transactionDate && !isDraftCalendarDate(draft.transactionDate)) {
    delete draft.transactionDate;
    status.transactionDate = 'missing';
    warnings.push({ code: 'INVALID_DATE', field: 'transactionDate' });
  }
  if (draft.currency && !SUPPORTED_CURRENCY_CODES.has(draft.currency)) {
    delete draft.currency;
    status.currency = 'ambiguous';
    warnings.push({ code: 'AMBIGUOUS_CURRENCY', field: 'currency' });
  }
  const totals = draft.amountCandidates.filter((candidate) => candidate.kind === 'total');
  if (totals.length !== 1) {
    status.total = totals.length > 1 ? 'ambiguous' : 'missing';
    warnings.push({
      code: totals.length > 1 ? 'AMBIGUOUS_TOTAL' : 'MISSING_TOTAL',
      field: 'total',
    });
  }
  return receiptDraftSchema.parse({
    ...draft,
    fieldStatus: status,
    warnings: [...new Map(warnings.map((w) => [`${w.code}:${w.field ?? ''}`, w])).values()],
  });
}
