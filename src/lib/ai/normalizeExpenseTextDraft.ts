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

const SELF_PRONOUNS = new Set([
  'i',
  'me',
  'myself',
  '我',
  '我自己',
  '本人',
  '私',
  'わたし',
  '僕',
  'ぼく',
  '自分',
]);
const ALL_PRONOUNS = new Set([
  'all',
  'everyone',
  'everybody',
  'all members',
  '大家',
  '全員',
  '全员',
  '所有人',
  'みんな',
  '皆',
  '皆さん',
]);
const GROUP_PRONOUNS = new Set([
  'we',
  'us',
  'ourselves',
  'all of us',
  '我們',
  '我们',
  '咱們',
  '咱们',
  '私たち',
  '私達',
  '僕たち',
  '僕達',
]);
const OTHER_PRONOUNS = new Set([
  'others',
  'the others',
  'other people',
  'everyone else',
  'everybody else',
  'remaining people',
  '其他人',
  '其它人',
  '其他的人',
  '其餘人',
  '其余人',
  '別人',
  '别人',
  '他の人',
  'ほかの人',
  'その他の人',
  '残りの人',
]);

type PronounKind = 'self' | 'all' | 'group' | 'other' | null;

function pronounKind(name: string): PronounKind {
  const normalized = key(name).replace(/[.,!?;:，。！？；：]/g, '');
  if (SELF_PRONOUNS.has(normalized)) return 'self';
  if (ALL_PRONOUNS.has(normalized)) return 'all';
  if (GROUP_PRONOUNS.has(normalized)) return 'group';
  if (
    OTHER_PRONOUNS.has(normalized) ||
    /^(?:其他|其它|其餘|其余|剩下)\s*\d*\s*(?:人|位)$/.test(normalized)
  ) {
    return 'other';
  }
  return null;
}

function resolveMemberName(name: string, members: DraftMember[]) {
  const matches = members.filter(
    (m) => key(m.displayName) === key(name) || key(m.username) === key(name)
  );
  return matches.length === 1 ? matches[0].id : undefined;
}

function resolvePayer(name: string | undefined, members: DraftMember[], currentUserId: string) {
  if (!name) return currentUserId;
  if (pronounKind(name) === 'self') return currentUserId;
  if (pronounKind(name)) return undefined;
  return resolveMemberName(name, members);
}

function resolveParticipants(
  split: ExpenseTextDraft['split'],
  members: DraftMember[],
  currentUserId: string
): Array<string | undefined> {
  const names =
    split.method === 'equal'
      ? split.participantNames
      : split.shares.map((share) => share.memberName);
  if (names.length === 0) return members.map((member) => member.id);

  const kinds = names.map(pronounKind);
  if (split.method === 'equal') {
    if (names.length === 1 && (kinds[0] === 'all' || kinds[0] === 'group')) {
      return members.map((member) => member.id);
    }
    if (
      names.length === 2 &&
      kinds.filter((kind) => kind === 'self').length === 1 &&
      kinds.filter((kind) => kind === 'other').length === 1
    ) {
      return members.map((member) => member.id);
    }
  }

  return names.map((name, index) => {
    if (kinds[index] === 'self') return currentUserId;
    if (kinds[index]) return undefined;
    return resolveMemberName(name, members);
  });
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
  const payerId = resolvePayer(draft.payerName, members, currentUserId);
  if (!payerId) warnings.push({ code: draft.payerName ? 'AMBIGUOUS_PAYER' : 'MISSING_PAYER' });
  const names =
    draft.split.method === 'equal'
      ? draft.split.participantNames
      : draft.split.shares.map((share) => share.memberName);
  const resolvedIds = resolveParticipants(draft.split, members, currentUserId);
  const rawParticipantIds = resolvedIds.filter((id): id is string => !!id);
  const participantIds = [...new Set(rawParticipantIds)];
  const expandsToAll =
    resolvedIds.length === members.length && rawParticipantIds.length === members.length;
  const hasUnresolvedParticipant =
    rawParticipantIds.length !== resolvedIds.length ||
    (!expandsToAll && rawParticipantIds.length !== names.length);
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
