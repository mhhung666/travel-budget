import { describe, expect, it } from 'vitest';
import { BADGES, computeBadgeCounts, computeBadges, type BadgeCounts } from '@/lib/badges';

const ZERO: BadgeCounts = {
  flights: 0,
  airlines: 0,
  alliances: 0,
  stays: 0,
  brands: 0,
  luxuryBrands: 0,
  countries: 0,
};

describe('computeBadgeCounts', () => {
  it('空輸入 → 全零', () => {
    expect(computeBadgeCounts([], [], 0)).toEqual(ZERO);
  });

  it('航空去重、聯盟查表（未知代碼不計聯盟）', () => {
    const counts = computeBadgeCounts(
      [
        { airline: 'BR' }, // star
        { airline: 'BR' },
        { airline: 'CI' }, // skyteam
        { airline: 'JX' }, // 無聯盟
        { airline: 'ZZ' }, // 不在目錄
      ],
      [],
      0
    );
    expect(counts.flights).toBe(5);
    expect(counts.airlines).toBe(4);
    expect(counts.alliances).toBe(2);
  });

  it('集滿三大聯盟', () => {
    const counts = computeBadgeCounts(
      [{ airline: 'BR' }, { airline: 'CI' }, { airline: 'CX' }],
      [],
      0
    );
    expect(counts.alliances).toBe(3);
  });

  it('品牌去重、null（獨立旅宿）不計、luxury 依 tier 查表', () => {
    const counts = computeBadgeCounts(
      [],
      [
        { brand: 'aman-resorts' }, // luxury
        { brand: 'aman-resorts' },
        { brand: 'st-regis' }, // luxury
        { brand: null },
      ],
      7
    );
    expect(counts.stays).toBe(4);
    expect(counts.brands).toBe(2);
    expect(counts.luxuryBrands).toBe(2);
    expect(counts.countries).toBe(7);
  });
});

describe('computeBadges', () => {
  it('順序與 BADGES 一致，value 帶指標現值', () => {
    const statuses = computeBadges(ZERO);
    expect(statuses.map((s) => s.id)).toEqual(BADGES.map((b) => b.id));
    expect(statuses.every((s) => !s.achieved && s.value === 0)).toBe(true);
  });

  it('達門檻即解鎖（含恰好等於）', () => {
    const statuses = computeBadges({ ...ZERO, flights: 10, countries: 5 });
    const byId = new Map(statuses.map((s) => [s.id, s]));
    expect(byId.get('flights-1')!.achieved).toBe(true);
    expect(byId.get('flights-10')!.achieved).toBe(true);
    expect(byId.get('flights-50')!.achieved).toBe(false);
    expect(byId.get('countries-5')!.achieved).toBe(true);
    expect(byId.get('countries-10')!.achieved).toBe(false);
  });

  it('id 穩定（公開分享卡與 i18n key 依賴；改動即破壞相容）', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'flights-1',
      'flights-10',
      'flights-50',
      'flights-100',
      'airlines-5',
      'airlines-15',
      'alliances-3',
      'stays-10',
      'stays-50',
      'brands-5',
      'brands-15',
      'luxury-5',
      'countries-5',
      'countries-10',
      'countries-30',
    ]);
  });
});
