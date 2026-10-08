import { DEFAULT_CURRENCY, isSupportedCurrency } from '@/constants/currencies';
import type { TripCurrencySettings } from '@/types';

/**
 * 旅程幣別設定的純函式（支出表單、結算、統計三處共用，避免各自硬編碼）。
 * 匯率一律指「1 單位外幣 = ? 帳本基準幣」（與 /api/exchange-rates 及 Expense.exchangeRate 同向）。
 */

/** 設定中選定的常用幣別代碼（依設定順序、過濾不支援的代碼）。 */
function selectedCodes(settings: TripCurrencySettings | null | undefined): string[] {
  return (settings?.currencies ?? [])
    .map((c) => c.code)
    .filter((code) => isSupportedCurrency(code));
}

/** 合併匯率表：以即時匯率為底，旅程自訂匯率優先覆蓋；基準幣恆為 1。 */
export function resolveTripRates(
  settings: TripCurrencySettings | null | undefined,
  liveRates: Record<string, number>,
  baseCurrency = DEFAULT_CURRENCY
): Record<string, number> {
  const merged: Record<string, number> = { ...liveRates };
  for (const c of settings?.currencies ?? []) {
    if (c.rate != null && c.rate > 0) merged[c.code] = c.rate;
  }
  merged[baseCurrency] = 1;
  return merged;
}

/**
 * 新增／編輯支出可選的幣別：**僅限**設定中選定的常用幣別（依設定順序）。
 * 未設定任何常用幣別 → 退回 [基準幣]。編輯既有支出時，其原幣若不在清單中會補進來
 * （否則下拉選單的值會對不到選項）。
 */
export function getTripExpenseCurrencies(
  settings: TripCurrencySettings | null | undefined,
  currentCurrency?: string,
  baseCurrency = DEFAULT_CURRENCY
): string[] {
  const selected = selectedCodes(settings);
  const base = selected.length > 0 ? selected : [baseCurrency];
  if (currentCurrency && !base.includes(currentCurrency)) {
    return [...base, currentCurrency];
  }
  return base;
}

/**
 * 結算／統計的「顯示幣別」選項：帳本基準幣 永遠在，加上設定選定的常用幣別（去重）。
 * 顯示換算是唯讀的，故一律含基準幣 讓使用者能切回基準幣。
 */
export function getTripDisplayCurrencies(
  settings: TripCurrencySettings | null | undefined,
  baseCurrency = DEFAULT_CURRENCY
): string[] {
  return Array.from(new Set([baseCurrency, ...selectedCodes(settings)]));
}

/** 新增支出的預設幣別；未設定或不支援則基準幣。 */
export function getTripDefaultCurrency(
  settings: TripCurrencySettings | null | undefined,
  baseCurrency = DEFAULT_CURRENCY
): string {
  const code = settings?.default_currency;
  return code && isSupportedCurrency(code) ? code : baseCurrency;
}

/** 某幣別的自訂匯率；未設定（或幣別不在常用清單）回 null。基準幣恆回 null（基準幣）。 */
export function getPinnedRate(
  settings: TripCurrencySettings | null | undefined,
  code: string,
  baseCurrency = DEFAULT_CURRENCY
): number | null {
  if (code === baseCurrency) return null;
  const entry = (settings?.currencies ?? []).find((c) => c.code === code);
  return entry?.rate != null && entry.rate > 0 ? entry.rate : null;
}
