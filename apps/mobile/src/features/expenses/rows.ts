import type { Expense } from '@/api/contracts';
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
/** IDs identify people, never names. Compare all visible identities, including a payer outside splits. */
export function expenseMemberLabel(
  member: ReadMember,
  peers: ReadMember[],
  viewerId: string | undefined,
  t: Messages
) {
  if (member.id === null) return t.removedMember;
  const name = memberName(member.name, t);
  const ids = [
    ...new Set(
      peers.filter((p) => p.id !== null && memberName(p.name, t) === name).map((p) => p.id!)
    ),
  ];
  let suffix = '';
  if (ids.some((id) => id !== member.id)) {
    let length = 1;
    while (
      length < member.id.length &&
      ids.some((id) => id !== member.id && id.slice(-length) === member.id!.slice(-length))
    )
      length++;
    suffix = ` · #${member.id.slice(-length)}`;
  }
  return `${name}${suffix}${member.id === viewerId ? ` · ${t.you}` : ''}${member.isVirtual === true ? ` · ${t.virtualMember}` : ''}`;
}
