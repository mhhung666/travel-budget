import { describe, expect, it } from 'vitest';
import { computeLoyaltyProgress } from '@/lib/loyalty';
import { PROGRAM_RULES, programTierKeys } from '@/constants/loyalty';

const CX = PROGRAM_RULES.CX;

type Entry = Parameters<typeof computeLoyaltyProgress>[0][number];

const entry = (over: Partial<Entry> = {}): Entry => ({
  date: '2027-03-10',
  status_points: 0,
  award_miles: 0,
  own_airline: false,
  ...over,
});

describe('computeLoyaltyProgress（CX 積分制）', () => {
  it('空輸入 → 綠卡、距銀卡 300、無續會資訊', () => {
    const p = computeLoyaltyProgress([], CX, null, '2027-06-01');
    expect(p.windowYear).toBe(2027);
    expect(p.windowPoints).toBe(0);
    expect(p.achievedTier.key).toBe('green');
    expect(p.nextTier?.key).toBe('silver');
    expect(p.pointsToNext).toBe(300);
    expect(p.renewal).toBeNull();
    expect(p.carryOverEstimate).toBe(0);
    expect(p.ownAirlineRatio).toBeNull();
    expect(p.awardMilesBalance).toBe(0);
  });

  it('曆年窗口切齊：只計 asOf 當年的積分，里數餘額不限年度', () => {
    const p = computeLoyaltyProgress(
      [
        entry({ date: '2026-12-31', status_points: 500, award_miles: 1000 }),
        entry({ date: '2027-01-01', status_points: 200, award_miles: 2000 }),
        entry({ date: '2027-12-31', status_points: 150, award_miles: -500 }),
      ],
      CX,
      null,
      '2027-06-01'
    );
    expect(p.windowPoints).toBe(350);
    expect(p.awardMilesBalance).toBe(2500);
  });

  it('跨級：一年內積分直達鑽石門檻（銀直升鑽）', () => {
    const p = computeLoyaltyProgress([entry({ status_points: 1250 })], CX, 'silver', '2027-06-01');
    expect(p.achievedTier.key).toBe('diamond');
    expect(p.nextTier?.key).toBe('diamond_plus');
    expect(p.pointsToNext).toBe(1150);
  });

  it('最高級（鑽石行政）達標後無下一級', () => {
    const p = computeLoyaltyProgress([entry({ status_points: 2400 })], CX, null, '2027-06-01');
    expect(p.achievedTier.key).toBe('diamond_plus');
    expect(p.nextTier).toBeNull();
    expect(p.pointsToNext).toBeNull();
  });

  it('續會：金卡自設等級對照續會門檻 300', () => {
    const notYet = computeLoyaltyProgress(
      [entry({ status_points: 299 })],
      CX,
      'gold',
      '2027-06-01'
    );
    expect(notYet.renewal).toEqual({ required: 300, met: false });

    const met = computeLoyaltyProgress([entry({ status_points: 300 })], CX, 'gold', '2027-06-01');
    expect(met.renewal).toEqual({ required: 300, met: true });
  });

  it('續會：銀卡無獨立續會門檻 → null', () => {
    const p = computeLoyaltyProgress([entry({ status_points: 100 })], CX, 'silver', '2027-06-01');
    expect(p.renewal).toBeNull();
  });

  it('結轉：達金卡且超額 → 超出已達門檻 × 50%（無條件捨去）', () => {
    // 750 分：達金卡（600），超額 150 → 結轉 75
    const p = computeLoyaltyProgress([entry({ status_points: 750 })], CX, null, '2027-06-01');
    expect(p.achievedTier.key).toBe('gold');
    expect(p.carryOverEstimate).toBe(75);
  });

  it('結轉：恰好達標（無超額）→ 0；未達金卡（銀卡超額）→ 0', () => {
    const exact = computeLoyaltyProgress([entry({ status_points: 600 })], CX, null, '2027-06-01');
    expect(exact.carryOverEstimate).toBe(0);

    // 450 分：達銀卡（300）超額 150，但結轉資格是金卡以上
    const silver = computeLoyaltyProgress([entry({ status_points: 450 })], CX, null, '2027-06-01');
    expect(silver.achievedTier.key).toBe('silver');
    expect(silver.carryOverEstimate).toBe(0);
  });

  it('負數 entry（adjust/兌換）：積分沖銷計入窗口、里數兌換扣餘額', () => {
    const p = computeLoyaltyProgress(
      [
        entry({ status_points: 400, award_miles: 5000 }),
        entry({ status_points: -150, award_miles: -3000 }),
      ],
      CX,
      null,
      '2027-06-01'
    );
    expect(p.windowPoints).toBe(250);
    expect(p.awardMilesBalance).toBe(2000);
  });

  it('自家占比：只計正積分，負數不干擾（CI 50% 條款的地基）', () => {
    const p = computeLoyaltyProgress(
      [
        entry({ status_points: 300, own_airline: true }),
        entry({ status_points: 100, own_airline: false }),
        entry({ status_points: -50, own_airline: true }),
      ],
      CX,
      null,
      '2027-06-01'
    );
    expect(p.ownAirlineRatio).toBe(0.75);
  });
});

describe('programTierKeys', () => {
  it('CX 五級由低到高', () => {
    expect(programTierKeys('CX')).toEqual(['green', 'silver', 'gold', 'diamond', 'diamond_plus']);
  });
});
