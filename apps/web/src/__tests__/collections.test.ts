import { describe, expect, it } from 'vitest';
import { formatByPrecision, summarizeAirlines, summarizeBrands } from '@/lib/collections';

describe('summarizeAirlines', () => {
  it('空輸入回空陣列', () => {
    expect(summarizeAirlines([])).toEqual([]);
  });

  it('依航空公司分組計數並記錄最早/最近日期', () => {
    const result = summarizeAirlines([
      { airline: 'BR', date: '2024-03-01' },
      { airline: 'JL', date: '2023-11-20' },
      { airline: 'BR', date: '2022-07-15' },
      { airline: 'BR', date: '2025-01-02' },
    ]);
    expect(result[0]).toEqual({
      airline: 'BR',
      count: 3,
      firstDate: '2022-07-15',
      lastDate: '2025-01-02',
    });
    expect(result[1]).toEqual({
      airline: 'JL',
      count: 1,
      firstDate: '2023-11-20',
      lastDate: '2023-11-20',
    });
  });

  it('次數相同時依代碼字典序（與輸入順序無關）', () => {
    const result = summarizeAirlines([
      { airline: 'JX', date: '2024-01-01' },
      { airline: 'CI', date: '2024-02-01' },
    ]);
    expect(result.map((r) => r.airline)).toEqual(['CI', 'JX']);
  });
});

describe('summarizeBrands', () => {
  it('依品牌分組：次數、已知晚數加總、飯店名去重', () => {
    const result = summarizeBrands([
      {
        brand: 'mandarin-oriental-hotels',
        hotelName: '文華東方 東京',
        checkIn: '2024-05-01',
        nights: 2,
      },
      {
        brand: 'mandarin-oriental-hotels',
        hotelName: '文華東方 曼谷',
        checkIn: '2023-01-10',
        nights: 3,
      },
      {
        brand: 'mandarin-oriental-hotels',
        hotelName: '文華東方 東京',
        checkIn: '2025-02-01',
        nights: null,
      },
      { brand: 'toyoko-inn-hotels', hotelName: '東橫INN 上野', checkIn: '2024-06-01', nights: 1 },
    ]);
    expect(result[0]).toMatchObject({
      brand: 'mandarin-oriental-hotels',
      stayCount: 3,
      nights: 5, // null 晚數不計入
      hotelNames: ['文華東方 東京', '文華東方 曼谷'],
      firstDate: '2023-01-10',
      lastDate: '2025-02-01',
    });
    expect(result[1]).toMatchObject({ brand: 'toyoko-inn-hotels', stayCount: 1 });
  });

  it('null 品牌（獨立旅宿）也彙整成一組', () => {
    const result = summarizeBrands([
      { brand: null, hotelName: '某民宿', checkIn: '2024-01-01', nights: 1 },
      { brand: null, hotelName: '另一民宿', checkIn: '2024-02-01', nights: 2 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ brand: null, stayCount: 2, nights: 3 });
  });

  it('次數相同時最近入住新→舊', () => {
    const result = summarizeBrands([
      { brand: 'a', hotelName: 'A', checkIn: '2023-01-01', nights: 1 },
      { brand: 'b', hotelName: 'B', checkIn: '2024-01-01', nights: 1 },
    ]);
    expect(result.map((r) => r.brand)).toEqual(['b', 'a']);
  });
});

describe('formatByPrecision', () => {
  it('依精度截取', () => {
    expect(formatByPrecision('2024-05-17', 'day')).toBe('2024-05-17');
    expect(formatByPrecision('2024-05-17', 'month')).toBe('2024-05');
    expect(formatByPrecision('2024-05-17', 'year')).toBe('2024');
  });
});
