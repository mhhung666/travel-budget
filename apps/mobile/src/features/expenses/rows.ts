import type { Expense, ExpenseDetail, ExpenseOptions } from '@/api/contracts';
import type { Messages } from '@/i18n/messages';

const categoryKeys = {
  accommodation: 'categoryAccommodation',
  transportation: 'categoryTransportation',
  food: 'categoryFood',
  shopping: 'categoryShopping',
  entertainment: 'categoryEntertainment',
  tickets: 'categoryTickets',
  other: 'categoryOther',
} as const satisfies Record<Expense['category'], keyof Messages>;

export function categoryLabel(category: Expense['category'], t: Messages) {
  return t[categoryKeys[category] ?? 'categoryOther'];
}
/** A payer or split user that no longer resolves has an empty name. */
export function memberName(name: string, t: Messages) {
  return name || t.unknownMember;
}
export const isForeign = (expense: Pick<Expense, 'currency'>) => expense.currency !== 'TWD';

/** Pages can overlap when data changes between requests; keep the first (newest) occurrence. */
export function uniqueExpenses(pages: { items: Expense[] }[]): Expense[] {
  return [...new Map(pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
}

export type ReadMember = { id: string | null; name: string; isVirtual?: boolean };
export type MemberLabelIndex = { label: (member: ReadMember) => string };

export function expenseMembers(expense: ExpenseDetail): ReadMember[] {
  return [
    { id: expense.payerId, name: expense.payerName, isVirtual: expense.payerIsVirtual },
    ...expense.splits.map((s) => ({ id: s.userId, name: s.displayName, isVirtual: s.isVirtual })),
  ];
}

/** Current names/codes depend only on the whole roster, never a loaded expense page.
 * An unavailable roster leaves names uncoded rather than guessing historical membership.
 * With a roster, historical references have a code; known historical collisions lengthen it. The API
 * has no complete historical roster, so historical disambiguation may vary as references load.
 */
export function createMemberLabelIndex(
  roster: ExpenseOptions['members'] | undefined,
  references: ReadMember[],
  viewerId: string | undefined,
  t: Messages
): MemberLabelIndex {
  const current = new Map(roster?.map((m) => [m.id, m]));
  const currentGroups = new Map<string, Set<string>>();
  for (const m of current.values()) {
    const name = memberName(m.displayName, t);
    if (!currentGroups.has(name)) currentGroups.set(name, new Set());
    currentGroups.get(name)!.add(m.id);
  }
  const currentCodes = new Map<string, string>();
  const codeFor = (id: string, ids: Set<string>, reserved = new Set<string>()) => {
    const peers = [...ids];
    let length = Math.min(6, id.length);
    while (
      length < id.length &&
      (reserved.has(id.slice(-length)) ||
        peers.some((peer) => peer !== id && peer.slice(-length) === id.slice(-length)))
    )
      length++;
    return id.slice(-length);
  };
  for (const ids of currentGroups.values())
    if (ids.size > 1) for (const id of ids) currentCodes.set(id, codeFor(id, ids));

  const historicalGroups = new Map<string, Set<string>>();
  for (const m of roster === undefined ? [] : references) {
    if (m.id === null || current.has(m.id)) continue;
    const name = memberName(m.name, t);
    if (!historicalGroups.has(name)) historicalGroups.set(name, new Set());
    historicalGroups.get(name)!.add(m.id);
  }
  const historicalCodes = new Map<string, Map<string, string>>();
  for (const [name, ids] of historicalGroups) {
    const reserved = new Set(
      [...(currentGroups.get(name) ?? [])].flatMap((id) => {
        const code = currentCodes.get(id);
        return code ? [code] : [];
      })
    );
    historicalCodes.set(name, new Map([...ids].map((id) => [id, codeFor(id, ids, reserved)])));
  }
  return {
    label: (member) => {
      if (member.id === null) return t.removedMember;
      const known = current.get(member.id);
      const name = memberName(known?.displayName ?? member.name, t);
      const code =
        roster === undefined
          ? undefined
          : known
            ? currentCodes.get(member.id)
            : (historicalCodes.get(name)?.get(member.id) ?? member.id.slice(-6));
      return `${name}${code ? ` · #${code}` : ''}${member.id === viewerId ? ` · ${t.you}` : ''}${(known?.isVirtual ?? member.isVirtual) === true ? ` · ${t.virtualMember}` : ''}`;
    },
  };
}
