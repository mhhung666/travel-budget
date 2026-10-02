import { DEFAULT_CURRENCY, isSupportedCurrency } from '@/constants/currencies';
import type { TripCurrencySettings } from '@/types';

/**
 * 旅程幣別設定的純函式（支出表單、結算、統計三處共用，避免各自硬編碼）。
 * 匯率一律指「1 單位外幣 = ? TWD」（與 /api/exchange-rates 及 Expense.exchangeRate 同向）。
 */

/** 設定中選定的常用幣別代碼（依設定順序、過濾不支援的代碼）。 */
function selectedCodes(settings: TripCurrencySettings | null | undefined): string[] {
  return (settings?.currencies ?? [])
    .map((c) => c.code)
    .filter((code) => isSupportedCurrency(code));
}

/** 合併匯率表：以即時匯率為底，旅程自訂匯率優先覆蓋；TWD 恆為 1。 */
export function resolveTripRates(
  settings: TripCurrencySettings | null | undefined,
  liveRates: Record<string, number>
): Record<string, number> {
  const merged: Record<string, number> = { ...liveRates };
  for (const c of settings?.currencies ?? []) {
    if (c.rate != null && c.rate > 0) merged[c.code] = c.rate;
  }
  merged[DEFAULT_CURRENCY] = 1;
  return merged;
}

/**
 * 新增／編輯支出可選的幣別：**僅限**設定中選定的常用幣別（依設定順序）。
 * 未設定任何常用幣別 → 退回 [TWD]。編輯既有支出時，其原幣若不在清單中會補進來
 * （否則下拉選單的值會對不到選項）。
 */
export function getTripExpenseCurrencies(
  settings: TripCurrencySettings | null | undefined,
  currentCurrency?: string
): string[] {
  const selected = selectedCodes(settings);
  const base = selected.length > 0 ? selected : [DEFAULT_CURRENCY];
  if (currentCurrency && !base.includes(currentCurrency)) {
    return [...base, currentCurrency];
  }
  return base;
}

/**
 * 結算／統計的「顯示幣別」選項：基準幣 TWD 永遠在，加上設定選定的常用幣別（去重）。
 * 顯示換算是唯讀的，故一律含 TWD 讓使用者能切回基準幣。
 */
export function getTripDisplayCurrencies(
  settings: TripCurrencySettings | null | undefined
): string[] {
  return Array.from(new Set([DEFAULT_CURRENCY, ...selectedCodes(settings)]));
}

/** 新增支出的預設幣別；未設定或不支援則 TWD。 */
export function getTripDefaultCurrency(settings: TripCurrencySettings | null | undefined): string {
  const code = settings?.default_currency;
  return code && isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
}

/** 某幣別的自訂匯率；未設定（或幣別不在常用清單）回 null。TWD 恆回 null（基準幣）。 */
export function getPinnedRate(
  settings: TripCurrencySettings | null | undefined,
  code: string
): number | null {
  if (code === DEFAULT_CURRENCY) return null;
  const entry = (settings?.currencies ?? []).find((c) => c.code === code);
  return entry?.rate != null && entry.rate > 0 ? entry.rate : null;
}
