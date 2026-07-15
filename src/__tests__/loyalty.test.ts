import { describe, expect, it } from 'vitest';
import {
  computeLoyaltyProgress,
  computeMilesSegmentsProgress,
  estimateCxStatusPoints,
} from '@/lib/loyalty';
import {
  PROGRAM_RULES,
  programTierKeys,
  type MilesSegmentsProgramRules,
  type PointsProgramRules,
} from '@/constants/loyalty';

const CX = PROGRAM_RULES.CX as PointsProgramRules;
const BR = PROGRAM_RULES.BR as MilesSegmentsProgramRules;

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

type BrEntry = Parameters<typeof computeMilesSegmentsProgress>[0][number];

const brEntry = (over: Partial<BrEntry> = {}): BrEntry => ({
  date: '2026-03-10',
  type: 'flight',
  qualifying_miles: 0,
  award_miles: 0,
  own_airline: false,
  ...over,
});

describe('computeMilesSegmentsProgress（BR 哩程＋航段制）', () => {
  it('空輸入 → 綠卡、距銀卡 30,000 哩 / 26 段', () => {
    const p = computeMilesSegmentsProgress([], BR, null, '2026-06-01');
    expect(p.windowStart).toBe('2025-06-01');
    expect(p.windowMiles).toBe(0);
    expect(p.windowSegments).toBe(0);
    expect(p.achievedTier.key).toBe('green');
    expect(p.nextTier?.key).toBe('silver');
    expect(p.milesToNext).toBe(30000);
    expect(p.segmentsToNext).toBe(26);
    expect(p.awardMilesBalance).toBe(0);
  });

  it('滾動 12 個月窗口：窗口外哩程不計，里數餘額不限窗口', () => {
    const p = computeMilesSegmentsProgress(
      [
        brEntry({ date: '2025-05-31', qualifying_miles: 40000, award_miles: 1000 }), // 窗口外
        brEntry({ date: '2025-06-01', qualifying_miles: 20000, award_miles: 2000 }), // 窗口起日（含）
        brEntry({ date: '2026-06-01', qualifying_miles: 5000, award_miles: -500 }), // asOf（含）
      ],
      BR,
      null,
      '2026-06-01'
    );
    expect(p.windowMiles).toBe(25000);
    expect(p.awardMilesBalance).toBe(2500);
  });

  it('航段路徑：26 段自家國際線 → 銀卡（哩程為 0）', () => {
    const entries = Array.from({ length: 26 }, () =>
      brEntry({ type: 'flight', own_airline: true })
    );
    const p = computeMilesSegmentsProgress(entries, BR, null, '2026-06-01');
    expect(p.windowSegments).toBe(26);
    expect(p.achievedTier.key).toBe('silver');
  });

  it('哩程路徑需附加 4 段：30,000 哩＋4 段 → 銀卡；只差 1 段 → 仍綠卡', () => {
    const seg = (n: number) =>
      Array.from({ length: n }, () => brEntry({ type: 'flight', own_airline: true }));

    const met = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 30000, own_airline: false, type: 'card' }), ...seg(4)],
      BR,
      null,
      '2026-06-01'
    );
    expect(met.achievedTier.key).toBe('silver');

    const notYet = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 30000, own_airline: false, type: 'card' }), ...seg(3)],
      BR,
      null,
      '2026-06-01'
    );
    expect(notYet.achievedTier.key).toBe('green');
  });

  it('純哩程路徑可跳級：50,000 哩、0 段 → 金卡（銀卡因缺附加航段未達）', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 50000, type: 'card', own_airline: false })],
      BR,
      null,
      '2026-06-01'
    );
    expect(p.achievedTier.key).toBe('gold');
    expect(p.nextTier?.key).toBe('diamond');
    expect(p.milesToNext).toBe(70000);
    expect(p.segmentsToNext).toBe(100);
  });

  it('非 flight 或非自家航班不計航段', () => {
    const p = computeMilesSegmentsProgress(
      [
        brEntry({ type: 'flight', own_airline: false }), // 他航
        brEntry({ type: 'stay', own_airline: true }), // 非飛行
        brEntry({ type: 'flight', own_airline: true }), // 計 1 段
      ],
      BR,
      null,
      '2026-06-01'
    );
    expect(p.windowSegments).toBe(1);
  });

  it('最高級（鑽石）達標後無下一級', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 120000, type: 'card' })],
      BR,
      null,
      '2026-06-01'
    );
    expect(p.achievedTier.key).toBe('diamond');
    expect(p.nextTier).toBeNull();
    expect(p.milesToNext).toBeNull();
    expect(p.segmentsToNext).toBeNull();
  });
});

describe('programTierKeys', () => {
  it('CX 五級由低到高', () => {
    expect(programTierKeys('CX')).toEqual(['green', 'silver', 'gold', 'diamond', 'diamond_plus']);
  });

  it('BR 四級由低到高', () => {
    expect(programTierKeys('BR')).toEqual(['green', 'silver', 'gold', 'diamond']);
  });
});

describe('estimateCxStatusPoints（CX 積分預估）', () => {
  it('區間邊界：750/751、2750/2751、5000/5001、7500/7501', () => {
    expect(estimateCxStatusPoints(750, 'economy', 'HK', 'TW').zone).toBe('ultraShort');
    expect(estimateCxStatusPoints(751, 'economy', 'HK', 'CN').zone).toBe('short1');
    expect(estimateCxStatusPoints(2750, 'economy', 'HK', 'CN').zone).toBe('short1');
    expect(estimateCxStatusPoints(2751, 'economy', 'HK', 'AE').zone).toBe('medium');
    expect(estimateCxStatusPoints(5000, 'economy', 'HK', 'AE').zone).toBe('medium');
    expect(estimateCxStatusPoints(5001, 'economy', 'HK', 'GB').zone).toBe('long');
    expect(estimateCxStatusPoints(7500, 'economy', 'HK', 'GB').zone).toBe('long');
    expect(estimateCxStatusPoints(7501, 'economy', 'HK', 'US').zone).toBe('ultraLong');
  });

  it('短途類別2：任一端點在日本/印尼/斯里蘭卡/尼泊爾/孟加拉/印度即算', () => {
    expect(estimateCxStatusPoints(1600, 'economy', 'HK', 'JP').zone).toBe('short2');
    expect(estimateCxStatusPoints(1600, 'economy', 'IN', 'HK').zone).toBe('short2');
    expect(estimateCxStatusPoints(1600, 'economy', 'HK', 'SG').zone).toBe('short1');
    // 類別2 只影響 751–2,750 哩；超短/中途不受國家影響
    expect(estimateCxStatusPoints(700, 'economy', 'HK', 'JP').zone).toBe('ultraShort');
    expect(estimateCxStatusPoints(3000, 'economy', 'HK', 'IN').zone).toBe('medium');
  });

  it('各艙等取值＝官方表 min–max（長途為例）', () => {
    // 官方 2025-08-20 表：長途經濟最低 S/N/Q/O Light 18、最高 Y/B/H/K Flex 70
    expect(estimateCxStatusPoints(6000, 'economy', 'HK', 'GB')).toEqual({
      zone: 'long',
      min: 18,
      max: 70,
    });
    expect(estimateCxStatusPoints(6000, 'premium_economy', 'HK', 'GB')).toEqual({
      zone: 'long',
      min: 65,
      max: 80,
    });
    expect(estimateCxStatusPoints(6000, 'business', 'HK', 'GB')).toEqual({
      zone: 'long',
      min: 100,
      max: 130,
    });
    // 頭等只有 F/A Flex 一種 → min === max
    expect(estimateCxStatusPoints(6000, 'first', 'HK', 'GB')).toEqual({
      zone: 'long',
      min: 160,
      max: 160,
    });
  });

  it('超長途（如 HKG–JFK ~8,000 哩）', () => {
    expect(estimateCxStatusPoints(8000, 'economy', 'HK', 'US')).toEqual({
      zone: 'ultraLong',
      min: 25,
      max: 90,
    });
  });
});
