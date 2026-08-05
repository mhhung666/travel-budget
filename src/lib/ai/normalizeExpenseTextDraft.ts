import { expenseTextDraftSchema, type ExpenseTextDraft } from './expenseTextDraftSchema';

export type DraftMember = { id: string; displayName: string; username: string };
export type NormalizedExpenseTextDraft = ExpenseTextDraft & {
  payerId?: string;
  participantIds: string[];
  requiresCorrection: boolean;
};
const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
function resolve(name: string, members: DraftMember[]) {
  const matches = members.filter(
    (m) => key(m.displayName) === key(name) || key(m.username) === key(name)
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

/** Resolve names only when unique; ambiguous or unknown people are never silently selected. */
export function normalizeExpenseTextDraft(
  input: ExpenseTextDraft,
  members: DraftMember[],
  currentUserId: string
): NormalizedExpenseTextDraft {
  const draft = expenseTextDraftSchema.parse(input);
  const warnings = [...draft.warnings];
  const payerId = draft.payerName ? resolve(draft.payerName, members) : currentUserId;
  if (!payerId) warnings.push({ code: draft.payerName ? 'AMBIGUOUS_PAYER' : 'MISSING_PAYER' });
  const names =
    draft.split.method === 'equal'
      ? draft.split.participantNames
      : draft.split.shares.map((share) => share.memberName);
  const participantIds = names.length
    ? names.map((name) => resolve(name, members)).filter((id): id is string => !!id)
    : members.map((member) => member.id);
  if (names.length && participantIds.length !== names.length)
    warnings.push({ code: 'AMBIGUOUS_PARTICIPANT' });
  if (!draft.currency) warnings.push({ code: 'MISSING_CURRENCY' });
  const uniqueWarnings = [...new Map(warnings.map((warning) => [warning.code, warning])).values()];
  return {
    ...draft,
    payerId,
    participantIds,
    warnings: uniqueWarnings,
    requiresCorrection: uniqueWarnings.length > 0,
  };
}
