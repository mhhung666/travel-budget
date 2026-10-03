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
  return t[categoryKeys[category]];
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
