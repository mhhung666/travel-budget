import { describe, it, expect } from 'vitest';
import { computeSplits, type SplitMemberInput, type SplitMode } from '@/lib/expenseSplit';

const mk = (entries: [string, boolean, string][]): SplitMemberInput[] =>
  entries.map(([id, selected, value]) => ({ id, selected, value }));

const run = (mode: SplitMode, entries: [string, boolean, string][], total: number, rate = 1) =>
  computeSplits(mode, mk(entries), total, rate);

describe('computeSplits', () => {
  describe('equal', () => {
    it('splits equally among selected members', () => {
      const r = run(
        'equal',
        [
          ['a', true, ''],
          ['b', true, ''],
          ['c', true, ''],
        ],
        300
      );
      expect(r.original).toEqual({ a: 100, b: 100, c: 100 });
      expect(r.balanced).toBe(true);
      expect(r.allocatedOriginal).toBe(300);
    });

    it('ignores unselected members (they get 0)', () => {
      const r = run(
        'equal',
        [
          ['a', true, ''],
          ['b', false, ''],
        ],
        300
      );
      expect(r.original).toEqual({ a: 300, b: 0 });
      expect(r.balanced).toBe(true);
    });

    it('is unbalanced when nobody is selected', () => {
      const r = run(
        'equal',
        [
          ['a', false, ''],
          ['b', false, ''],
        ],
        300
      );
      expect(r.balanced).toBe(false);
      expect(r.allocatedOriginal).toBe(0);
    });
  });

  describe('amount', () => {
    it('uses exact manual amounts when they sum to the total', () => {
      const r = run(
        'amount',
        [
          ['a', true, '60'],
          ['b', true, '40'],
        ],
        100
      );
      expect(r.original).toEqual({ a: 60, b: 40 });
      expect(r.balanced).toBe(true);
    });

    it('auto-splits the remainder among blank members', () => {
      const r = run(
        'amount',
        [
          ['a', true, '60'],
          ['b', true, ''],
          ['c', true, ''],
        ],
        100
      );
      expect(r.original).toEqual({ a: 60, b: 20, c: 20 });
      expect(r.balanced).toBe(true);
    });

    it('flags over-allocation when manual amounts exceed the total', () => {
      const r = run(
        'amount',
        [
          ['a', true, '60'],
          ['b', true, '60'],
        ],
        100
      );
      expect(r.imbalance).toBe('over');
      expect(r.balanced).toBe(false);
    });

    it('flags under-allocation when all-manual amounts fall short', () => {
      const r = run(
        'amount',
        [
          ['a', true, '30'],
          ['b', true, '30'],
        ],
        100
      );
      expect(r.imbalance).toBe('under');
      expect(r.balanced).toBe(false);
    });
  });

  describe('percent', () => {
    it('converts percentages to amounts', () => {
      const r = run(
        'percent',
        [
          ['a', true, '50'],
          ['b', true, '50'],
        ],
        200
      );
      expect(r.original).toEqual({ a: 100, b: 100 });
      expect(r.balanced).toBe(true);
    });

    it('auto-fills the remaining percentage for blank members', () => {
      const r = run(
        'percent',
        [
          ['a', true, '50'],
          ['b', true, ''],
        ],
        200
      );
      expect(r.original).toEqual({ a: 100, b: 100 });
      expect(r.balanced).toBe(true);
    });

    it('flags over-allocation when percentages exceed 100', () => {
      const r = run(
        'percent',
        [
          ['a', true, '80'],
          ['b', true, '80'],
        ],
        200
      );
      expect(r.imbalance).toBe('over');
      expect(r.balanced).toBe(false);
    });
  });

  describe('shares', () => {
    it('splits proportionally by weight', () => {
      const r = run(
        'shares',
        [
          ['a', true, '2'],
          ['b', true, '1'],
        ],
        300
      );
      expect(r.original).toEqual({ a: 200, b: 100 });
      expect(r.balanced).toBe(true);
    });

    it('defaults blank weights to 1', () => {
      const r = run(
        'shares',
        [
          ['a', true, ''],
          ['b', true, ''],
          ['c', true, ''],
        ],
        300
      );
      expect(r.original).toEqual({ a: 100, b: 100, c: 100 });
      expect(r.balanced).toBe(true);
    });

    it('is unbalanced when total weight is zero', () => {
      const r = run(
        'shares',
        [
          ['a', true, '0'],
          ['b', true, '0'],
        ],
        300
      );
      expect(r.balanced).toBe(false);
    });
  });

  describe('currency conversion', () => {
    it('converts each share to TWD using the exchange rate', () => {
      const r = run(
        'equal',
        [
          ['a', true, ''],
          ['b', true, ''],
        ],
        100,
        0.21
      );
      expect(r.twd.a).toBeCloseTo(10.5, 6);
      expect(r.twd.b).toBeCloseTo(10.5, 6);
      expect(r.allocatedTWD).toBeCloseTo(21, 6);
    });
  });
});
