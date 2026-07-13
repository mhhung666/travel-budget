import { describe, it, expect } from 'vitest';
import {
  computeYearInReview,
  availableReviewYears,
  type YearInReviewInputs,
  type YearInReviewTrip,
} from '@/lib/yearInReview';

// 台北 / 東京 / 大阪 / 紐約座標（國碼小寫，模擬 Location.country_code）。
const TPE = { lat: 25.04, lon: 121.5, countryCode: 'tw' };
const TYO = { lat: 35.68, lon: 139.69, countryCode: 'jp' };
const OSA = { lat: 34.69, lon: 135.5, countryCode: 'jp' };
const NYC = { lat: 40.71, lon: -74.0, countryCode: 'us' };

const SELF = 'self';

function inputs(partial: Partial<YearInReviewInputs>): YearInReviewInputs {
  return {
    trips: [],
    itinerary: [],
    expenses: [],
    selfUserId: SELF,
    ...partial,
  };
}

describe('computeYearInReview — 地理', () => {
  it('趟數/國家/里程：只計入起訖與該年重疊的旅程', () => {
    const trips: YearInReviewTrip[] = [
      {
        id: 't1',
        startDate: '2025-04-01',
        endDate: '2025-04-05',
        departure: TPE,
        destination: TYO,
        memberIds: [SELF, 'a'],
      },
      {
        id: 't2', // 不同年，應被排除
        startDate: '2024-01-01',
        endDate: '2024-01-03',
        departure: TPE,
        destination: NYC,
        memberIds: [SELF, 'b'],
      },
    ];
    const r = computeYearInReview(inputs({ trips }), 2025);
    expect(r.tripCount).toBe(1);
    // 2025 只去了日本（出發地台灣 + 目的地日本）= 2 國
    expect(r.countryCount).toBe(2);
    expect(r.distanceKm).toBeGreaterThan(2000);
    expect(r.distanceKm).toBeLessThan(2500); // 台北→東京 ~2100km
    expect(r.companionCount).toBe(1); // 'a'，排除自己
  });

  it('跨年旅程計入兩年', () => {
    const trips: YearInReviewTrip[] = [
      {
        id: 't1',
        startDate: '2025-12-30',
        endDate: '2026-01-02',
        departure: TPE,
        destination: TYO,
        memberIds: [SELF],
      },
    ];
    expect(computeYearInReview(inputs({ trips }), 2025).tripCount).toBe(1);
    expect(computeYearInReview(inputs({ trips }), 2026).tripCount).toBe(1);
    expect(computeYearInReview(inputs({ trips }), 2024).tripCount).toBe(0);
  });

  it('最長旅程天數（含端點）', () => {
    const trips: YearInReviewTrip[] = [
      { id: 't1', startDate: '2025-04-01', endDate: '2025-04-05', memberIds: [SELF] }, // 5 天
      { id: 't2', startDate: '2025-06-01', endDate: '2025-06-03', memberIds: [SELF] }, // 3 天
    ];
    expect(computeYearInReview(inputs({ trips }), 2025).longestTripDays).toBe(5);
  });

  it('城市依座標去重；行程日國碼併入國家數', () => {
    const trips: YearInReviewTrip[] = [
      { id: 't1', startDate: '2025-04-01', endDate: '2025-04-05', memberIds: [SELF] },
    ];
    const itinerary = [
      { tripId: 't1', ...TYO },
      { tripId: 't1', ...OSA },
      { tripId: 't1', lat: 35.681, lon: 139.691, countryCode: 'jp' }, // 與 TYO 同座標（四捨五入後）
      { tripId: 'other', ...NYC }, // 不屬於該年旅程 → 不計
    ];
    const r = computeYearInReview(inputs({ trips, itinerary }), 2025);
    expect(r.cityCount).toBe(2); // 東京（含重複）+ 大阪
    expect(r.countryCount).toBe(1); // 只有 jp（趟無出發/目的地國碼）
  });

  it('旅伴跨旅程去重、排除自己', () => {
    const trips: YearInReviewTrip[] = [
      { id: 't1', startDate: '2025-04-01', endDate: '2025-04-05', memberIds: [SELF, 'a', 'b'] },
      { id: 't2', startDate: '2025-06-01', endDate: '2025-06-03', memberIds: [SELF, 'b', 'c'] },
    ];
    expect(computeYearInReview(inputs({ trips }), 2025).companionCount).toBe(3); // a,b,c
  });
});

describe('computeYearInReview — 花費', () => {
  const trips: YearInReviewTrip[] = [
    { id: 't1', startDate: '2025-01-01', endDate: '2025-12-31', memberIds: [SELF] },
  ];

  it('依支出日期落在該年彙整；分類排序與最大分類', () => {
    const expenses = [
      { date: '2025-03-01', category: 'food', shareAmount: 100 },
      { date: '2025-03-02', category: 'food', shareAmount: 50 },
      { date: '2025-07-15', category: 'shopping', shareAmount: 300 },
      { date: '2024-12-31', category: 'food', shareAmount: 999 }, // 別年 → 排除
    ];
    const r = computeYearInReview(inputs({ trips, expenses }), 2025);
    expect(r.totalSpend).toBe(450);
    expect(r.expenseCount).toBe(3);
    expect(r.topCategory).toEqual({ category: 'shopping', total: 300 });
    expect(r.categoryBreakdown).toEqual([
      { category: 'shopping', total: 300 },
      { category: 'food', total: 150 },
    ]);
  });

  it('月份分桶 + busiestMonth（0-based）', () => {
    const expenses = [
      { date: '2025-03-10', category: 'food', shareAmount: 100 },
      { date: '2025-07-01', category: 'food', shareAmount: 500 },
      { date: '2025-07-20', category: 'shopping', shareAmount: 100 },
    ];
    const r = computeYearInReview(inputs({ trips, expenses }), 2025);
    expect(r.monthlySpend[2]).toBe(100); // 三月
    expect(r.monthlySpend[6]).toBe(600); // 七月
    expect(r.busiestMonth).toBe(6);
  });

  it('null 分類歸入 other', () => {
    const expenses = [{ date: '2025-05-01', category: null, shareAmount: 80 }];
    const r = computeYearInReview(inputs({ trips, expenses }), 2025);
    expect(r.topCategory).toEqual({ category: 'other', total: 80 });
  });

  it('無花費：totalSpend 0、topCategory null、busiestMonth null', () => {
    const r = computeYearInReview(inputs({ trips }), 2025);
    expect(r.totalSpend).toBe(0);
    expect(r.topCategory).toBeNull();
    expect(r.busiestMonth).toBeNull();
    expect(r.monthlySpend).toHaveLength(12);
  });
});

describe('computeYearInReview — 空輸入', () => {
  it('完全沒有資料時所有數字為 0/空', () => {
    const r = computeYearInReview(inputs({}), 2025);
    expect(r).toMatchObject({
      year: 2025,
      tripCount: 0,
      countryCount: 0,
      cityCount: 0,
      distanceKm: 0,
      longestTripDays: 0,
      companionCount: 0,
      totalSpend: 0,
      expenseCount: 0,
      topCategory: null,
      busiestMonth: null,
    });
    expect(r.categoryBreakdown).toEqual([]);
  });
});

describe('availableReviewYears', () => {
  it('旅程涵蓋年份 ∪ 支出年份，新到舊去重', () => {
    const trips = [
      { startDate: '2024-12-30', endDate: '2025-01-02' }, // 2024, 2025
      { startDate: '2023-06-01', endDate: '2023-06-05' }, // 2023
    ];
    const expenses = [{ date: '2026-01-01' }, { date: '2025-05-05' }];
    expect(availableReviewYears(trips, expenses)).toEqual([2026, 2025, 2024, 2023]);
  });

  it('無資料回空陣列', () => {
    expect(availableReviewYears([], [])).toEqual([]);
  });
});

describe('computeYearInReview — 旅行成就（航班/住宿/新解鎖）', () => {
  it('該年航班數與新解鎖航空：首次出現以全歷史判定', () => {
    const flights = [
      { airline: 'BR', date: '2024-03-01' }, // BR 首次在 2024
      { airline: 'BR', date: '2025-05-01' },
      { airline: 'JX', date: '2025-06-01' }, // JX 首次在 2025 → 新解鎖
    ];
    const r = computeYearInReview(inputs({ flights }), 2025);
    expect(r.flightCount).toBe(2);
    expect(r.newAirlineCount).toBe(1); // 只有 JX
  });

  it('住宿與品牌解鎖：獨立旅宿（brand null）計次數但不算解鎖', () => {
    const stays = [
      { brand: 'mandarin-oriental-hotels', checkIn: '2025-02-01' }, // 首次 → 解鎖
      { brand: 'toyoko-inn-hotels', checkIn: '2023-01-01' }, // 首次在 2023
      { brand: 'toyoko-inn-hotels', checkIn: '2025-03-01' },
      { brand: null, checkIn: '2025-04-01' }, // 獨立旅宿
    ];
    const r = computeYearInReview(inputs({ stays }), 2025);
    expect(r.stayCount).toBe(3);
    expect(r.newBrandCount).toBe(1); // 只有文華東方
  });

  it('未提供成就資料時相關欄位為 0（向後相容）', () => {
    const r = computeYearInReview(inputs({}), 2025);
    expect(r.flightCount).toBe(0);
    expect(r.newAirlineCount).toBe(0);
    expect(r.stayCount).toBe(0);
    expect(r.newBrandCount).toBe(0);
  });
});
