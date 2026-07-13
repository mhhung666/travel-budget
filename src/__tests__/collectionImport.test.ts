import { describe, expect, it } from 'vitest';
import {
  activityImportKind,
  dayDateFromTrip,
  matchHotelBrand,
  parseFlightNo,
} from '@/lib/collectionImport';

describe('activityImportKind', () => {
  it('transport → flight、accommodation → stay、其他 → null', () => {
    expect(activityImportKind('transport')).toBe('flight');
    expect(activityImportKind('accommodation')).toBe('stay');
    expect(activityImportKind('sightseeing')).toBeNull();
    expect(activityImportKind('other')).toBeNull();
  });
});

describe('parseFlightNo', () => {
  it('常見寫法：緊連 / 連字號 / 空格 / 小寫', () => {
    expect(parseFlightNo('BR182 台北→東京')).toEqual({ airline: 'BR', flightNo: 'BR182' });
    expect(parseFlightNo('搭機 br-182')).toEqual({ airline: 'BR', flightNo: 'BR182' });
    expect(parseFlightNo('JL 96')).toEqual({ airline: 'JL', flightNo: 'JL96' });
  });

  it('數字開頭的 IATA 代碼（如 9C）也能命中', () => {
    expect(parseFlightNo('9C8892 上海')).toEqual({ airline: '9C', flightNo: '9C8892' });
  });

  it('沒有航班號樣式時回 null（純數字不誤判）', () => {
    expect(parseFlightNo('前往機場')).toBeNull();
    expect(parseFlightNo('14:00 集合')).toBeNull();
  });
});

describe('matchHotelBrand', () => {
  it('繁中名與英文名皆可比對（不分大小寫）', () => {
    expect(matchHotelBrand('入住 文華東方 東京')).toBe('mandarin-oriental-hotels');
    expect(matchHotelBrand('Check-in mandarin oriental Tokyo')).toBe('mandarin-oriental-hotels');
    expect(matchHotelBrand('東橫INN 上野')).toBe('toyoko-inn-hotels');
  });

  it('多重命中取最長名稱（Hilton Garden Inn 不被 Hilton 搶走）', () => {
    expect(matchHotelBrand('Hilton Garden Inn Osaka')).toBe('hilton-garden-inn');
  });

  it('比不到品牌回 null（獨立旅宿）', () => {
    expect(matchHotelBrand('某某民宿')).toBeNull();
  });
});

describe('dayDateFromTrip', () => {
  it('由出發日推第 N 天（Day 1 = 出發日）', () => {
    expect(dayDateFromTrip('2025-04-01', 1)).toBe('2025-04-01');
    expect(dayDateFromTrip('2025-04-01', 3)).toBe('2025-04-03');
    expect(dayDateFromTrip('2025-04-30T00:00:00.000Z', 2)).toBe('2025-05-01'); // 跨月 + ISO 輸入
  });

  it('旅程未設日期回 null', () => {
    expect(dayDateFromTrip(null, 1)).toBeNull();
    expect(dayDateFromTrip('', 1)).toBeNull();
  });
});
