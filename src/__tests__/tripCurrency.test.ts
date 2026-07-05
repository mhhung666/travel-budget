import { describe, it, expect } from 'vitest';
import {
  resolveTripRates,
  getTripCurrencyOptions,
  getTripDefaultCurrency,
  getPinnedRate,
} from '@/lib/tripCurrency';
import type { TripCurrencySettings } from '@/types';

const settings: TripCurrencySettings = {
  default_currency: 'JPY',
  currencies: [
    { code: 'JPY', rate: 0.22 },
    { code: 'USD', rate: null },
  ],
};

const liveRates = { TWD: 1, JPY: 0.208, USD: 31.5, EUR: 34.2 };

describe('resolveTripRates', () => {
  it('自訂匯率覆蓋即時匯率；未自訂者保留即時值', () => {
    const rates = resolveTripRates(settings, liveRates);
    expect(rates.JPY).toBe(0.22); // pinned
    expect(rates.USD).toBe(31.5); // rate: null → live
    expect(rates.EUR).toBe(34.2); // 不在常用清單 → live
  });

  it('TWD 恆為 1（即使即時匯率表異常）', () => {
    expect(resolveTripRates(null, { TWD: 0.5 }).TWD).toBe(1);
    expect(resolveTripRates(settings, {}).TWD).toBe(1);
  });

  it('未設定（null/undefined）→ 即時匯率原樣（加 TWD=1）', () => {
    expect(resolveTripRates(null, liveRates)).toEqual({ ...liveRates, TWD: 1 });
    expect(resolveTripRates(undefined, liveRates)).toEqual({ ...liveRates, TWD: 1 });
  });

  it('忽略非正數的自訂匯率', () => {
    const bad: TripCurrencySettings = {
      default_currency: null,
      currencies: [{ code: 'JPY', rate: 0 }],
    };
    expect(resolveTripRates(bad, liveRates).JPY).toBe(0.208);
  });
});

describe('getTripCurrencyOptions', () => {
  it('常用幣別依設定順序排前，其餘照預設順序接後、不重複', () => {
    const options = getTripCurrencyOptions(settings);
    expect(options.slice(0, 2)).toEqual(['JPY', 'USD']);
    expect(new Set(options).size).toBe(options.length);
    expect(options).toContain('TWD');
    expect(options).toContain('EUR');
  });

  it('未設定 → 完整預設清單', () => {
    expect(getTripCurrencyOptions(null)).toEqual(['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB']);
  });

  it('過濾不支援的幣別代碼（防禦舊資料）', () => {
    const weird: TripCurrencySettings = {
      default_currency: null,
      currencies: [{ code: 'XYZ', rate: null }],
    };
    expect(getTripCurrencyOptions(weird)).toEqual(['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB']);
  });
});

describe('getTripDefaultCurrency', () => {
  it('回傳設定的預設幣別', () => {
    expect(getTripDefaultCurrency(settings)).toBe('JPY');
  });

  it('未設定或代碼不支援 → TWD', () => {
    expect(getTripDefaultCurrency(null)).toBe('TWD');
    expect(getTripDefaultCurrency({ default_currency: 'XYZ', currencies: [] })).toBe('TWD');
  });
});

describe('getPinnedRate', () => {
  it('回傳常用清單中的自訂匯率', () => {
    expect(getPinnedRate(settings, 'JPY')).toBe(0.22);
  });

  it('rate 為 null（用即時匯率）或幣別不在清單 → null', () => {
    expect(getPinnedRate(settings, 'USD')).toBeNull();
    expect(getPinnedRate(settings, 'EUR')).toBeNull();
    expect(getPinnedRate(null, 'JPY')).toBeNull();
  });

  it('TWD 為基準幣，恆回 null', () => {
    const withTwd: TripCurrencySettings = {
      default_currency: null,
      currencies: [{ code: 'TWD', rate: 2 }],
    };
    expect(getPinnedRate(withTwd, 'TWD')).toBeNull();
  });
});
