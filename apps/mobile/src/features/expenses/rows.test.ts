import { describe, expect, it } from 'vitest';
import { expenseCategories, type Expense } from '@/api/contracts';
import { messages } from '@/i18n/messages';
import { categoryLabel, expenseMemberLabel, isForeign, memberName, uniqueExpenses } from './rows';

const expense = (id: string, overrides: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-10-02',
  description: id,
  category: 'food',
  payerId: null,
  payerName: '',
  amount: 1,
  originalAmount: 1,
  currency: 'TWD',
  ...overrides,
});

describe('expense rows', () => {
  it('labels every category in all four languages', () => {
    for (const t of Object.values(messages))
      for (const category of expenseCategories) expect(categoryLabel(category, t)).toBeTruthy();
    expect(categoryLabel('food', messages.en)).toBe('Food & Dining');
    expect(categoryLabel('food', messages.zh)).toBe('餐飲');
    expect(categoryLabel('tickets', messages.jp)).toBe('チケット');
  });
  it('falls back to a localized label for members that no longer resolve', () => {
    expect(memberName('Amy', messages.en)).toBe('Amy');
    expect(memberName('', messages.en)).toBe('Unknown member');
    expect(memberName('', messages.zh)).toBe('未知成員');
  });
  it('treats every non-TWD expense as foreign', () => {
    expect(isForeign({ currency: 'TWD' })).toBe(false);
    expect(isForeign({ currency: 'JPY' })).toBe(true);
  });
  it('flattens pages without repeating an expense that moved between requests', () => {
    const first = expense('a', { description: 'newest copy' });
    const pages = [
      { items: [first, expense('b')] },
      { items: [expense('b', { description: 'stale copy' }), expense('c')] },
    ];
    expect(uniqueExpenses(pages).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    // The later duplicate overwrites the value but keeps the first position.
    expect(uniqueExpenses(pages)[1].description).toBe('stale copy');
    expect(uniqueExpenses([])).toEqual([]);
  });
});

it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'identifies self, virtual and removed references in %s',
  (locale) => {
    const t = messages[locale];
    const a = { id: 'a123456', name: 'Same' },
      b = { id: 'b123456', name: 'Same', isVirtual: true };
    const peers = [a, b, a];
    expect(expenseMemberLabel(a, peers, a.id, t)).toBe(`Same · #a123456 · ${t.you}`);
    expect(expenseMemberLabel(b, peers, a.id, t)).toBe(`Same · #b123456 · ${t.virtualMember}`);
    expect(expenseMemberLabel(b, peers.slice().reverse(), a.id, t)).toBe(
      expenseMemberLabel(b, peers, a.id, t)
    );
    expect(expenseMemberLabel({ id: null, name: 'Stale private name' }, peers, a.id, t)).toBe(
      t.removedMember
    );
    expect(expenseMemberLabel({ id: 'other', name: 'One' }, peers, a.id, t)).toBe('One');
    expect(expenseMemberLabel({ id: 'other', name: '' }, [], a.id, t)).toBe(t.unknownMember);
  }
);
it('uses the shortest distinguishing suffix and never marks a same-name person as self', () => {
  const peers = [
    { id: 'id-ab', name: 'Amy' },
    { id: 'id-cb', name: 'Amy' },
    { id: 'id-ad', name: 'Amy' },
  ];
  expect(expenseMemberLabel(peers[0], peers, 'id-cb', messages.en)).toBe('Amy · #ab');
  expect(expenseMemberLabel(peers[2], peers, 'id-cb', messages.en)).toBe('Amy · #d');
});

it('uses Other for unrecognized display categories without mutating the stored value', () => {
  const stored = 'legacy-category' as Expense['category'];
  expect(categoryLabel(stored, messages.en)).toBe(messages.en.categoryOther);
  expect(stored).toBe('legacy-category');
});
