// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { expenseSearchFiltersSchema } from '@travel-budget/contracts';
import { parseExpenseSearch, searchExpenseRows, ExpenseSearchChanged } from '@/lib/expenseSearch';
import { withLedgerV2, authorizeLedger } from '@/lib/ledger';
import type { ExpenseDtoInput } from '@/lib/dto';
const actor = 'a'.repeat(24),
  peer = 'b'.repeat(24),
  trip = 'c'.repeat(24);
const person = (id: string) => ({
  _id: id,
  displayName: 'Same Name',
  username: 'private',
  isVirtual: id === peer,
});
const rows = Array.from(
  { length: 45 },
  (_, i): ExpenseDtoInput => ({
    _id: (100 - i).toString(16).padStart(24, '0'),
    baseCurrency: 'USD',
    amount: 100.01,
    originalAmount: 3000.3,
    currency: 'TWD',
    exchangeRate: 1 / 30,
    description: i === 44 ? '[Coffee].*' : 'Dinner',
    category: i === 44 ? 'historic' : 'food',
    date: new Date(i === 44 ? '2026-10-08T23:59:00Z' : '2026-10-09'),
    createdAt: new Date('2026-10-09'),
    payer: i === 43 ? null : person(i % 2 ? peer : actor),
    splits: [
      { user: person(actor), shareAmount: 33.335 },
      { user: person(peer), shareAmount: 66.675 },
    ],
    tags: ['hidden-tag'],
    attachments: [{ key: 'private-key', contentType: 'x', size: 3 }],
  })
);
function search(
  input: Parameters<typeof searchExpenseRows>[3] = { keyword: '' },
  data = rows,
  user = actor,
  id = trip
) {
  return withLedgerV2(() => {
    authorizeLedger({ baseCurrency: 'USD' });
    return searchExpenseRows(data, user, id, input);
  });
}
describe('G4b full-trip search contract and shared calculations', () => {
  it('computes all matching totals before page slicing, with stable ties and same totals on every page', () => {
    const first = search();
    expect(first.items).toHaveLength(20);
    expect(first.summary.count).toBe(45);
    expect(first.summary.total).toBe(4500.45);
    expect(first.summary.mySpent).toBe(1500.3);
    expect(first.summary.members.map((m) => m.paid).reduce((a, b) => a + b, 0)).toBeCloseTo(
      first.summary.total
    );
    const second = search({ keyword: '', cursor: first.nextCursor! });
    const third = search({ keyword: '', cursor: second.nextCursor! });
    expect(first.summary).toEqual(second.summary);
    expect(second.summary).toEqual(third.summary);
    expect(new Set([...first.items, ...second.items, ...third.items].map((e) => e.id)).size).toBe(
      45
    );
    expect(third.nextCursor).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/private-key|hidden-tag|username|attachments|splits/);
  });
  it('uses literal keyword, complete historical categories, inclusive date-only and ID-based payer filters together', () => {
    const found = search({
      keyword: ' [coFFee].* ',
      category: 'other',
      payerId: actor.toUpperCase(),
      dateFrom: '2026-10-08',
      dateTo: '2026-10-08',
    });
    expect(found.items).toHaveLength(1);
    expect(found.items[0].category).toBe('other');
    expect(found.summary.total).toBe(100.01);
    expect(search({ keyword: 'hidden-tag' }).summary.count).toBe(0);
    expect(
      search({ keyword: 'Same Name', payerId: peer }).items.every((e) => e.payerId === peer)
    ).toBe(true);
    expect(search({ keyword: '', payerId: 'missing' }).summary.count).toBe(1);
    expect(found.payers).toHaveLength(3);
  });
  it.each([
    'keyword=a&keyword=b',
    'dateFrom=2026-02-30',
    'dateFrom=2026-10-09&dateTo=2026-10-08',
    'category=historic',
    'payerId=bad',
    'limit=100',
    'cursor=bad',
    'keyword=' + 'a'.repeat(201),
  ])('rejects invalid query %s', (query) => {
    expect(() => parseExpenseSearch(new URL(`https://test/?${query}`))).toThrow();
  });
  it('invalidates cursors after actor, trip, criteria, deleted/edited rows or name changes', () => {
    const cursor = search().nextCursor!;
    expect(() => search({ keyword: 'Dinner', cursor })).toThrow(ExpenseSearchChanged);
    expect(() => search({ keyword: '', cursor }, rows, peer)).toThrow(ExpenseSearchChanged);
    expect(() => search({ keyword: '', cursor }, rows, actor, peer)).toThrow(ExpenseSearchChanged);
    expect(() => search({ keyword: '', cursor }, rows.slice(1))).toThrow(ExpenseSearchChanged);
    expect(() =>
      search(
        { keyword: '', cursor },
        rows.map((r, i) => (i ? r : { ...r, description: 'changed' }))
      )
    ).toThrow(ExpenseSearchChanged);
    expect(() => search({ keyword: '', cursor: cursor.replace(/\.20$/, '.21') })).toThrow(
      ExpenseSearchChanged
    );
  });
  it('canonicalizes filters and returns explicit zero summary for no matches', () => {
    expect(parseExpenseSearch(new URL('https://test/?keyword=%20Dinner%20'))).toEqual({
      keyword: 'Dinner',
    });
    expect(expenseSearchFiltersSchema.parse({})).toEqual({ keyword: '' });
    expect(search({ keyword: 'none' }).summary).toEqual({
      count: 0,
      total: 0,
      mySpent: 0,
      categories: [],
      members: [],
    });
  });
});
