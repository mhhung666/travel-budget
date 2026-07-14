import { describe, expect, it } from 'vitest';
import {
  activityImportKind,
  dayDateFromTrip,
  matchHotelBrand,
  parseAirports,
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

describe('parseAirports', () => {
  it('各種方向記號：箭頭 / 連字號 / 斜線 / to / 中文往到', () => {
    expect(parseAirports('BR182 TPE→NRT')).toEqual({ from: 'TPE', to: 'NRT' });
    expect(parseAirports('TPE - NRT')).toEqual({ from: 'TPE', to: 'NRT' });
    expect(parseAirports('TPE/HND 來回')).toEqual({ from: 'TPE', to: 'HND' });
    expect(parseAirports('TPE to KIX')).toEqual({ from: 'TPE', to: 'KIX' });
    expect(parseAirports('TPE 往 CTS')).toEqual({ from: 'TPE', to: 'CTS' });
    expect(parseAirports('TPE ✈ FUK')).toEqual({ from: 'TPE', to: 'FUK' });
  });

  it('只認大寫代碼：小寫字句不誤判（the-end 不是 THE→END）', () => {
    expect(parseAirports('the-end of trip')).toBeNull();
    expect(parseAirports('前往機場')).toBeNull();
    expect(parseAirports('TPE 起飛')).toBeNull(); // 只有一組代碼
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
