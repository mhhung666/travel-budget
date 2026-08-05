import { receiptDraftSchema, type ReceiptDraft } from './receiptDraftSchema';

const currencies = new Set(['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB']);
const validDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/** Never resolves uncertainty on the user's behalf; only makes invalid claims explicit. */
export function normalizeReceiptDraft(input: ReceiptDraft): ReceiptDraft {
  const draft = receiptDraftSchema.parse(input);
  const warnings = [...draft.warnings];
  const status = { ...draft.fieldStatus };
  if (draft.transactionDate && !validDate(draft.transactionDate)) { delete draft.transactionDate; status.transactionDate = 'missing'; warnings.push({ code: 'INVALID_DATE', field: 'transactionDate' }); }
  if (draft.currency && !currencies.has(draft.currency)) { delete draft.currency; status.currency = 'ambiguous'; warnings.push({ code: 'AMBIGUOUS_CURRENCY', field: 'currency' }); }
  const totals = draft.amountCandidates.filter((candidate) => candidate.kind === 'total');
  if (totals.length !== 1) { status.total = totals.length > 1 ? 'ambiguous' : 'missing'; warnings.push({ code: totals.length > 1 ? 'AMBIGUOUS_TOTAL' : 'MISSING_TOTAL', field: 'total' }); }
  return receiptDraftSchema.parse({ ...draft, fieldStatus: status, warnings: [...new Map(warnings.map((w) => [`${w.code}:${w.field ?? ''}`, w])).values()] });
}
