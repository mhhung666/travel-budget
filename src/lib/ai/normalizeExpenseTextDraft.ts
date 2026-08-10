import { expenseTextDraftSchema, type ExpenseTextDraft } from './expenseTextDraftSchema';
import { computeSplits, type SplitMode } from '@/lib/expenseSplit';

export type DraftMember = { id: string; displayName: string; username: string };
export type ResolvedExpenseTextSplit = {
  mode: SplitMode;
  entries: Array<{ memberId: string; value: string }>;
};
export type NormalizedExpenseTextDraft = ExpenseTextDraft & {
  payerId?: string;
  participantIds: string[];
  /** Safe, member-ID based input for the existing expense form. Omitted when correction is needed. */
  resolvedSplit?: ResolvedExpenseTextSplit;
  requiresCorrection: boolean;
};
const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
function resolve(name: string, members: DraftMember[]) {
  const matches = members.filter(
    (m) => key(m.displayName) === key(name) || key(m.username) === key(name)
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

function splitMode(method: ExpenseTextDraft['split']['method']): SplitMode {
  if (method === 'percentage') return 'percent';
  if (method === 'ratio') return 'shares';
  return method;
}

function splitValue(split: ExpenseTextDraft['split'], index: number): string {
  if (split.method === 'amount') return String(split.shares[index].amount);
  if (split.method === 'percentage') return String(split.shares[index].percentage);
  if (split.method === 'ratio') return String(split.shares[index].units);
  return '';
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
  const resolvedIds = names.map((name) => resolve(name, members));
  const rawParticipantIds = names.length
    ? resolvedIds.filter((id): id is string => !!id)
    : members.map((member) => member.id);
  const participantIds = [...new Set(rawParticipantIds)];
  const hasUnresolvedParticipant = names.length > 0 && rawParticipantIds.length !== names.length;
  if (hasUnresolvedParticipant) warnings.push({ code: 'AMBIGUOUS_PARTICIPANT' });
  const hasDuplicateParticipant = participantIds.length !== rawParticipantIds.length;
  if (hasDuplicateParticipant) warnings.push({ code: 'DUPLICATE_PARTICIPANT' });
  const hasProviderSplitWarning = draft.warnings.some(
    (warning) => warning.code.includes('SPLIT') || warning.code.includes('PARTICIPANT')
  );

  let resolvedSplit: ResolvedExpenseTextSplit | undefined;
  if (!hasUnresolvedParticipant && !hasDuplicateParticipant && !hasProviderSplitWarning) {
    const entries = participantIds.map((memberId, index) => ({
      memberId,
      value: splitValue(draft.split, index),
    }));
    const mode = splitMode(draft.split.method);
    const computation = computeSplits(
      mode,
      members.map((member) => {
        const entry = entries.find((candidate) => candidate.memberId === member.id);
        return { id: member.id, selected: !!entry, value: entry?.value ?? '' };
      }),
      draft.originalAmount,
      1
    );
    if (computation.balanced) resolvedSplit = { mode, entries };
    else warnings.push({ code: 'INVALID_SPLIT_TOTAL' });
  }
  if (!draft.currency) warnings.push({ code: 'MISSING_CURRENCY' });
  const uniqueWarnings = [...new Map(warnings.map((warning) => [warning.code, warning])).values()];
  return {
    ...draft,
    payerId,
    participantIds,
    resolvedSplit,
    warnings: uniqueWarnings,
    requiresCorrection: uniqueWarnings.length > 0,
  };
}
