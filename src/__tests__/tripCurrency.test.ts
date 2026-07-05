import { describe, it, expect } from 'vitest';
import {
  resolveTripRates,
  getTripExpenseCurrencies,
  getTripDisplayCurrencies,
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

describe('getTripExpenseCurrencies', () => {
  it('僅限設定選定的常用幣別（依設定順序）', () => {
    expect(getTripExpenseCurrencies(settings)).toEqual(['JPY', 'USD']);
  });

  it('未設定 → 僅 TWD', () => {
    expect(getTripExpenseCurrencies(null)).toEqual(['TWD']);
    expect(getTripExpenseCurrencies({ default_currency: null, currencies: [] })).toEqual(['TWD']);
  });

  it('編輯模式：原幣不在清單時補進來（避免下拉值對不到選項）', () => {
    expect(getTripExpenseCurrencies(settings, 'EUR')).toEqual(['JPY', 'USD', 'EUR']);
    // 已在清單則不重複
    expect(getTripExpenseCurrencies(settings, 'JPY')).toEqual(['JPY', 'USD']);
  });

  it('過濾不支援的幣別代碼（防禦舊資料）', () => {
    const weird: TripCurrencySettings = {
      default_currency: null,
      currencies: [{ code: 'XYZ', rate: null }],
    };
    expect(getTripExpenseCurrencies(weird)).toEqual(['TWD']);
  });
});

describe('getTripDisplayCurrencies', () => {
  it('TWD 永遠在，加上選定的常用幣別（去重）', () => {
    expect(getTripDisplayCurrencies(settings)).toEqual(['TWD', 'JPY', 'USD']);
  });

  it('選定清單已含 TWD 時不重複', () => {
    const withTwd: TripCurrencySettings = {
      default_currency: null,
      currencies: [
        { code: 'TWD', rate: null },
        { code: 'JPY', rate: 0.22 },
      ],
    };
    expect(getTripDisplayCurrencies(withTwd)).toEqual(['TWD', 'JPY']);
  });

  it('未設定 → 僅 TWD', () => {
    expect(getTripDisplayCurrencies(null)).toEqual(['TWD']);
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
