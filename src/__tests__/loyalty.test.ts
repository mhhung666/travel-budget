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
const CI = PROGRAM_RULES.CI as PointsProgramRules;
const BR = PROGRAM_RULES.BR as MilesSegmentsProgramRules;

type Entry = Parameters<typeof computeLoyaltyProgress>[0][number];

const entry = (over: Partial<Entry> = {}): Entry => ({
  date: '2027-03-10',
  status_points: 0,
  award_miles: 0,
  own_airline: false,
  ...over,
});

describe('computeLoyaltyProgress（CX 積分制，calendar 窗口＋sameWindow 續會，回歸）', () => {
  it('空輸入 → 綠卡、距銀卡 300、無續會資訊', () => {
    const p = computeLoyaltyProgress([], CX, null, null, '2027-06-01');
    expect(p.windowYear).toBe(2027);
    expect(p.windowStart).toBeNull();
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
      null,
      '2027-06-01'
    );
    expect(p.windowPoints).toBe(350);
    expect(p.awardMilesBalance).toBe(2500);
  });

  it('跨級：一年內積分直達鑽石門檻（銀直升鑽）', () => {
    const p = computeLoyaltyProgress(
      [entry({ status_points: 1250 })],
      CX,
      'silver',
      null,
      '2027-06-01'
    );
    expect(p.achievedTier.key).toBe('diamond');
    expect(p.nextTier?.key).toBe('diamond_plus');
    expect(p.pointsToNext).toBe(1150);
  });

  it('最高級（鑽石行政）達標後無下一級', () => {
    const p = computeLoyaltyProgress(
      [entry({ status_points: 2400 })],
      CX,
      null,
      null,
      '2027-06-01'
    );
    expect(p.achievedTier.key).toBe('diamond_plus');
    expect(p.nextTier).toBeNull();
    expect(p.pointsToNext).toBeNull();
  });

  it('續會（sameWindow）：金卡自設等級對照續會門檻 300，points＝windowPoints', () => {
    const notYet = computeLoyaltyProgress(
      [entry({ status_points: 299 })],
      CX,
      'gold',
      null,
      '2027-06-01'
    );
    expect(notYet.renewal).toEqual({ required: 300, points: 299, met: false });

    const met = computeLoyaltyProgress(
      [entry({ status_points: 300 })],
      CX,
      'gold',
      null,
      '2027-06-01'
    );
    expect(met.renewal).toEqual({ required: 300, points: 300, met: true });
  });

  it('續會：銀卡無獨立續會門檻 → null', () => {
    const p = computeLoyaltyProgress(
      [entry({ status_points: 100 })],
      CX,
      'silver',
      null,
      '2027-06-01'
    );
    expect(p.renewal).toBeNull();
  });

  it('結轉：達金卡且超額 → 超出已達門檻 × 50%（無條件捨去）', () => {
    // 750 分：達金卡（600），超額 150 → 結轉 75
    const p = computeLoyaltyProgress([entry({ status_points: 750 })], CX, null, null, '2027-06-01');
    expect(p.achievedTier.key).toBe('gold');
    expect(p.carryOverEstimate).toBe(75);
  });

  it('結轉：恰好達標（無超額）→ 0；未達金卡（銀卡超額）→ 0', () => {
    const exact = computeLoyaltyProgress(
      [entry({ status_points: 600 })],
      CX,
      null,
      null,
      '2027-06-01'
    );
    expect(exact.carryOverEstimate).toBe(0);

    // 450 分：達銀卡（300）超額 150，但結轉資格是金卡以上
    const silver = computeLoyaltyProgress(
      [entry({ status_points: 450 })],
      CX,
      null,
      null,
      '2027-06-01'
    );
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
      null,
      '2027-06-01'
    );
    expect(p.ownAirlineRatio).toBe(0.75);
  });
});

describe('computeLoyaltyProgress（CI 積分制，rolling12m 升等＋term2y 續卡，2026-07-16 查證）', () => {
  it('rolling12m 窗口邊界：恰在 windowStart 當天算入，前一天不算', () => {
    // asOf 2027-06-01 → windowStart 2026-06-01
    const p = computeLoyaltyProgress(
      [
        entry({ date: '2026-05-31', status_points: 100 }), // windowStart 前一天，不算
        entry({ date: '2026-06-01', status_points: 200 }), // windowStart 當天，算
      ],
      CI,
      null,
      null,
      '2027-06-01'
    );
    expect(p.windowStart).toBe('2026-06-01');
    expect(p.windowYear).toBeNull();
    expect(p.windowPoints).toBe(200);
  });

  it('門檻跨級：360 直達金卡、720 直達翡翠卡、1400 直達晶鑽卡', () => {
    const gold = computeLoyaltyProgress(
      [entry({ status_points: 360 })],
      CI,
      null,
      null,
      '2027-06-01'
    );
    expect(gold.achievedTier.key).toBe('gold');
    expect(gold.nextTier?.key).toBe('emerald');

    const emerald = computeLoyaltyProgress(
      [entry({ status_points: 720 })],
      CI,
      null,
      null,
      '2027-06-01'
    );
    expect(emerald.achievedTier.key).toBe('emerald');

    const paragon = computeLoyaltyProgress(
      [entry({ status_points: 1400 })],
      CI,
      null,
      null,
      '2027-06-01'
    );
    expect(paragon.achievedTier.key).toBe('paragon');
    expect(paragon.nextTier).toBeNull();
  });

  it('續卡 term2y：tierExpiresAt null → renewal 恆 null（即使 currentTier 有續卡門檻）', () => {
    const p = computeLoyaltyProgress(
      [entry({ status_points: 600 })],
      CI,
      'gold',
      null,
      '2027-06-01'
    );
    expect(p.renewal).toBeNull();
  });

  it('續卡 term2y：member 級無 renewalThreshold → renewal null（即使有效期）', () => {
    const p = computeLoyaltyProgress(
      [entry({ status_points: 600 })],
      CI,
      'member',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toBeNull();
  });

  it('續卡 term2y：窗口＝[效期往前推 2 年, min(asOf, 效期)]，窗口外 entry 不計入 renewal.points', () => {
    // tierExpiresAt 2028-03-01 → renewalStart 2026-03-01；asOf 2027-06-01 < 效期 → renewalEnd = asOf
    const p = computeLoyaltyProgress(
      [
        entry({ date: '2026-02-28', status_points: 1000 }), // renewalStart 前，不計
        entry({ date: '2026-03-01', status_points: 300 }), // renewalStart 當天，計
        entry({ date: '2027-06-01', status_points: 100 }), // renewalEnd（asOf）當天，計
        entry({ date: '2027-07-01', status_points: 9999 }), // 晚於 asOf，不計
      ],
      CI,
      'gold',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toEqual({ required: 580, points: 400, met: false });
  });

  it('續卡 term2y：達標（renewal.points ≥ renewalThreshold）', () => {
    const p = computeLoyaltyProgress(
      [entry({ date: '2027-01-01', status_points: 600 })],
      CI,
      'gold',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toEqual({ required: 580, points: 600, met: true });
  });

  it('自家航班占比警示：升等窗口占比 < 50%', () => {
    const p = computeLoyaltyProgress(
      [
        entry({ status_points: 200, own_airline: true }),
        entry({ status_points: 300, own_airline: false }),
      ],
      CI,
      null,
      null,
      '2027-06-01'
    );
    expect(p.ownAirlineRatio).toBe(0.4);
    expect(p.ownAirlineRatio! < CI.ownAirlineMinRatio!).toBe(true);
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
    const p = computeMilesSegmentsProgress([], BR, null, null, '2026-06-01');
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
    const p = computeMilesSegmentsProgress(entries, BR, null, null, '2026-06-01');
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
      null,
      '2026-06-01'
    );
    expect(met.achievedTier.key).toBe('silver');

    const notYet = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 30000, own_airline: false, type: 'card' }), ...seg(3)],
      BR,
      null,
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
      null,
      '2026-06-01'
    );
    expect(p.achievedTier.key).toBe('diamond');
    expect(p.nextTier).toBeNull();
    expect(p.milesToNext).toBeNull();
    expect(p.segmentsToNext).toBeNull();
    // 未設效期 → 續卡恆 null（即便該級有續卡門檻）
    expect(p.renewal).toBeNull();
  });
});

describe('computeMilesSegmentsProgress（BR 續卡 term2y，2026-07-16 evaair.com 查證）', () => {
  it('無卡籍效期 → renewal 恆 null', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 40000, type: 'card' })],
      BR,
      'silver',
      null,
      '2027-06-01'
    );
    expect(p.renewal).toBeNull();
  });

  it('green 級無續卡門檻 → renewal null（即使有效期）', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ qualifying_miles: 40000, type: 'card' })],
      BR,
      'green',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toBeNull();
  });

  it('哩程路徑達標：silver 續卡門檻 40,000 哩／42 段，哩程達標即可（航段不足）', () => {
    // tierExpiresAt 2028-03-01 → 續卡窗口 [2026-03-01, min(asOf, 效期)]；asOf 2027-06-01 < 效期
    const p = computeMilesSegmentsProgress(
      [brEntry({ date: '2027-01-01', qualifying_miles: 40000, type: 'card' })],
      BR,
      'silver',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toEqual({
      requiredMiles: 40000,
      requiredSegments: 42,
      miles: 40000,
      segments: 0,
      met: true,
    });
  });

  it('航段路徑達標：silver 續卡 42 段自家國際線即可（哩程不足）', () => {
    const entries = Array.from({ length: 42 }, () =>
      brEntry({ date: '2027-01-01', type: 'flight', own_airline: true })
    );
    const p = computeMilesSegmentsProgress(entries, BR, 'silver', '2028-03-01', '2027-06-01');
    expect(p.renewal).toEqual({
      requiredMiles: 40000,
      requiredSegments: 42,
      miles: 0,
      segments: 42,
      met: true,
    });
  });

  it('哩程與航段皆不足 → met false', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ date: '2027-01-01', qualifying_miles: 10000, type: 'card' })],
      BR,
      'silver',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal?.met).toBe(false);
  });

  it('窗口邊界：續卡窗口＝效期往前推 2 年，起日當天算入、前一天不算', () => {
    // tierExpiresAt 2027-03-01 → renewalStart 2025-03-01
    const p = computeMilesSegmentsProgress(
      [
        brEntry({ date: '2025-02-28', qualifying_miles: 40000, type: 'card' }), // 起日前一天，不算
        brEntry({ date: '2025-03-01', qualifying_miles: 5000, type: 'card' }), // 起日當天，算
      ],
      BR,
      'silver',
      '2027-03-01',
      '2027-01-01'
    );
    expect(p.renewal?.miles).toBe(5000);
  });

  it('asOf 早於卡籍效期時，續卡窗口只算到 asOf（效期本身晚於 asOf 不計入）', () => {
    // tierExpiresAt 2029-01-01（遠在 asOf 之後）→ renewalEnd = asOf
    const p = computeMilesSegmentsProgress(
      [
        brEntry({ date: '2027-06-01', qualifying_miles: 5000, type: 'card' }), // asOf 當天，算
        brEntry({ date: '2027-06-02', qualifying_miles: 9999, type: 'card' }), // 晚於 asOf，不算
      ],
      BR,
      'silver',
      '2029-01-01',
      '2027-06-01'
    );
    expect(p.renewal?.miles).toBe(5000);
  });

  it('diamond 續卡：200,000 哩／140 段（升等門檻不變仍為 120,000）', () => {
    const p = computeMilesSegmentsProgress(
      [brEntry({ date: '2027-01-01', qualifying_miles: 200000, type: 'card' })],
      BR,
      'diamond',
      '2028-03-01',
      '2027-06-01'
    );
    expect(p.renewal).toEqual({
      requiredMiles: 200000,
      requiredSegments: 140,
      miles: 200000,
      segments: 0,
      met: true,
    });
    // 升等門檻本身不變
    expect(BR.tiers.find((t) => t.key === 'diamond')?.miles).toBe(120000);
  });
});

describe('programTierKeys', () => {
  it('CX 五級由低到高', () => {
    expect(programTierKeys('CX')).toEqual(['green', 'silver', 'gold', 'diamond', 'diamond_plus']);
  });

  it('BR 四級由低到高', () => {
    expect(programTierKeys('BR')).toEqual(['green', 'silver', 'gold', 'diamond']);
  });

  it('CI 四級由低到高', () => {
    expect(programTierKeys('CI')).toEqual(['member', 'gold', 'emerald', 'paragon']);
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
