import { describe, it, expect } from 'vitest';
import {
  computeSplits,
  reconstructOriginalShares,
  type SplitMemberInput,
  type SplitMode,
} from '@/lib/expenseSplit';
import { allocateMoney, roundMoney } from '@/lib/money';

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

describe('reconstructOriginalShares (edit round trip)', () => {
  // 模擬：新增時 computeSplits → 伺服器分配 → 編輯表單重建 → 未改任何欄位直接回存。
  function roundTrip(mode: SplitMode, values: string[], total: number, rate: number) {
    const members = values.map((value, i) => ({ id: String(i), selected: true, value }));
    const created = computeSplits(mode, members, total, rate);
    const amount = roundMoney(total * rate);
    const stored = allocateMoney(
      amount,
      members.map((m) => created.twd[m.id])
    );
    const { shares, equal } = reconstructOriginalShares(total, stored);
    const edited = computeSplits(
      equal ? 'equal' : 'amount',
      members.map((m, i) => ({ ...m, value: equal ? '' : String(shares[i]) })),
      total,
      rate
    );
    const saved = allocateMoney(
      amount,
      members.map((m) => edited.twd[m.id])
    );
    return { stored, saved, balanced: edited.balanced, equal };
  }

  it.each([
    ['KRW shares', 'shares', ['2', '1', '1'], 10000, 0.02341],
    ['VND shares', 'shares', ['2', '2', '2', '3'], 496469, 0.001262],
    ['JPY shares with fractional yen', 'shares', ['1', '1', '2'], 15425, 0.2133],
    ['JPY percent', 'percent', ['1', '19', ''], 3868, 0.2133],
    ['USD shares', 'shares', ['1', '1', '2'], 100.01, 32.15],
    ['THB amount', 'amount', ['1.99', '4', ''], 81.62, 0.9123],
    ['TWD amount', 'amount', ['300', '300', ''], 1001, 1],
  ] as const)('%s saves unchanged without editing', (_, mode, values, total, rate) => {
    const r = roundTrip(mode, [...values], total, rate);
    expect(r.balanced).toBe(true);
    expect(r.saved).toEqual(r.stored);
  });

  it('infers equal mode only when shares match an even split exactly', () => {
    expect(roundTrip('equal', ['', '', ''], 100, 0.02341).equal).toBe(true);
    expect(reconstructOriginalShares(100, [33.33, 33.33, 33.34]).equal).toBe(false);
    expect(reconstructOriginalShares(100, [33.34, 33.33, 33.33]).equal).toBe(true);
  });
});
