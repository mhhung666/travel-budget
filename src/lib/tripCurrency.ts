import { CURRENCY_CODES, DEFAULT_CURRENCY } from '@/constants/currencies';
import type { TripCurrencySettings } from '@/types';

/**
 * 旅程幣別設定的純函式（支出表單、結算、統計三處共用，避免各自硬編碼）。
 * 匯率一律指「1 單位外幣 = ? TWD」（與 /api/exchange-rates 及 Expense.exchangeRate 同向）。
 */

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
 * 幣別選項排序：常用幣別（依設定順序）排前，其餘支援幣別照預設順序接後。
 * 刻意不隱藏非常用幣別——既有支出可能用到，編輯時選項必須還在。
 */
export function getTripCurrencyOptions(
  settings: TripCurrencySettings | null | undefined
): string[] {
  const preferred = (settings?.currencies ?? [])
    .map((c) => c.code)
    .filter((code) => CURRENCY_CODES.includes(code));
  const rest = CURRENCY_CODES.filter((code) => !preferred.includes(code));
  return [...preferred, ...rest];
}

/** 新增支出的預設幣別；未設定則 TWD。 */
export function getTripDefaultCurrency(settings: TripCurrencySettings | null | undefined): string {
  const code = settings?.default_currency;
  return code && CURRENCY_CODES.includes(code) ? code : DEFAULT_CURRENCY;
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
