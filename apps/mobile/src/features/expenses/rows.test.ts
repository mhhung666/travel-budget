import { describe, expect, it } from 'vitest';
import { expenseCategories, type Expense } from '@/api/contracts';
import { messages } from '@/i18n/messages';
import {
  categoryLabel,
  createMemberLabelIndex,
  isForeign,
  memberName,
  uniqueExpenses,
} from './rows';

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

const a = '0123456789abcdef01a1b2c3';
const b = '0123456789abcdef01b9c0d1';
const c = '0123456789abcdef02b9c0d1';
const d = '0123456789abcdef03b9c0d1';
const e = '0123456789abcdef04b9c0d1';
const localeKeys = Object.keys(messages) as (keyof typeof messages)[];
it.each(localeKeys)(
  'keeps unique names free of IDs and preserves self/virtual/removed in %s',
  (locale) => {
    const t = messages[locale];
    for (const id of [a, b, c, d, e]) expect(id).toMatch(/^[a-f0-9]{24}$/);
    const index = createMemberLabelIndex(
      [
        { id: a, displayName: 'Alice' },
        { id: b, displayName: 'Bob' },
      ],
      [],
      a,
      t
    );
    expect(index.label({ id: a, name: 'Alice' })).toBe(`Alice · ${t.you}`);
    expect(index.label({ id: b, name: 'Bob', isVirtual: true })).toBe(`Bob · ${t.virtualMember}`);
    expect(index.label({ id: null, name: 'Stale private name' })).toBe(t.removedMember);
    expect(index.label({ id: a, name: 'Old name' })).toBe(`Alice · ${t.you}`);
  }
);
it.each(localeKeys)(
  'uses roster-based six-digit codes independent of visible pages in %s',
  (locale) => {
    const t = messages[locale];
    const roster = [
      { id: a, displayName: 'Alice' },
      { id: b, displayName: 'Alice' },
    ];
    const first = { id: a, name: 'Alice' };
    const other = { id: b, name: 'Alice' };
    for (const references of [[first], [first, other], [other, first]]) {
      const index = createMemberLabelIndex(roster, references, undefined, t);
      expect(index.label(first)).toBe('Alice · #a1b2c3');
      expect(index.label(other)).toBe('Alice · #b9c0d1');
      expect(index.label(first)).not.toContain(a);
    }
  }
);
it.each(localeKeys)(
  'lengthens colliding suffixes consistently for roster and historical references in %s',
  (locale) => {
    const t = messages[locale];
    const roster = [
      { id: b, displayName: 'Alice' },
      { id: c, displayName: 'Alice' },
    ];
    for (const ordered of [roster, roster.slice().reverse()]) {
      const index = createMemberLabelIndex(ordered, [], undefined, t);
      expect(index.label({ id: b, name: 'Alice' })).toBe('Alice · #1b9c0d1');
      expect(index.label({ id: c, name: 'Alice' })).toBe('Alice · #2b9c0d1');
    }
    const history = [
      { id: d, name: 'Alice' },
      { id: e, name: 'Alice' },
    ];
    for (const ordered of [history, history.slice().reverse()]) {
      const index = createMemberLabelIndex(
        [
          { id: a, displayName: 'Alice' },
          { id: b, displayName: 'Alice' },
        ],
        ordered,
        undefined,
        t
      );
      expect(index.label({ id: b, name: 'Alice' })).toBe('Alice · #b9c0d1');
      expect(index.label(history[0])).toBe('Alice · #3b9c0d1');
      expect(index.label(history[1])).toBe('Alice · #4b9c0d1');
    }
  }
);
it.each(localeKeys)(
  'codes historical references only with a roster, without reviving null identities in %s',
  (locale) => {
    const t = messages[locale];
    const history = [
      { id: b, name: 'Alice', isVirtual: true },
      { id: null, name: 'Secret' },
    ];
    const index = createMemberLabelIndex([{ id: a, displayName: 'Alice' }], history, b, t);
    expect(index.label(history[0])).toBe(`Alice · #b9c0d1 · ${t.you} · ${t.virtualMember}`);
    expect(index.label(history[1])).toBe(t.removedMember);
    expect(index.label({ id: a, name: 'Alice' })).toBe('Alice');
    const unavailable = createMemberLabelIndex(undefined, history, undefined, t);
    expect(unavailable.label(history[0])).toBe(`Alice · ${t.virtualMember}`);
    expect(unavailable.label(history[1])).toBe(t.removedMember);
  }
);

it.each(localeKeys)(
  'does not infer historical membership from an unavailable roster in %s',
  (locale) => {
    const t = messages[locale];
    const references = [
      { id: b, name: 'Alice', isVirtual: true },
      { id: c, name: 'Alice' },
    ];
    const unavailable = createMemberLabelIndex(undefined, references, b, t);
    expect(unavailable.label(references[0])).toBe(`Alice · ${t.you} · ${t.virtualMember}`);
    expect(unavailable.label(references[1])).toBe('Alice');
    // An empty but successfully read roster is different from missing roster data.
    const empty = createMemberLabelIndex([], references, b, t);
    expect(empty.label(references[0])).toContain('Alice · #1b9c0d1');
    expect(empty.label(references[1])).toBe('Alice · #2b9c0d1');
  }
);

it('uses Other for unrecognized display categories without mutating the stored value', () => {
  const stored = 'legacy-category' as Expense['category'];
  expect(categoryLabel(stored, messages.en)).toBe(messages.en.categoryOther);
  expect(stored).toBe('legacy-category');
});

it.each(localeKeys)(
  'current virtual flags override stale references and reach choices in %s',
  (locale) => {
    const t = messages[locale];
    const labels = createMemberLabelIndex(
      [
        { id: a, displayName: 'Alice', isVirtual: true },
        { id: b, displayName: 'Bob', isVirtual: false },
      ],
      [],
      undefined,
      t
    );
    expect(labels.label({ id: a, name: 'Old' })).toBe(`Alice · ${t.virtualMember}`);
    expect(labels.label({ id: b, name: 'Old', isVirtual: true })).toBe('Bob');
    const unavailable = createMemberLabelIndex(undefined, [], undefined, t);
    expect(unavailable.label({ id: a, name: 'Alice', isVirtual: true })).toBe(
      `Alice · ${t.virtualMember}`
    );
  }
);
