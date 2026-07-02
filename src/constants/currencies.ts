import type { Currency } from '@/types';

/**
 * Supported currencies with i18n keys for names
 */
export const CURRENCIES: Currency[] = [
  { code: 'TWD', symbol: 'NT$', nameKey: 'currency.TWD' },
  { code: 'JPY', symbol: '¥', nameKey: 'currency.JPY' },
  { code: 'USD', symbol: '$', nameKey: 'currency.USD' },
  { code: 'EUR', symbol: '€', nameKey: 'currency.EUR' },
  { code: 'HKD', symbol: 'HK$', nameKey: 'currency.HKD' },
  { code: 'THB', symbol: '฿', nameKey: 'currency.THB' },
] as const;

/**
 * Valid currency codes for validation
 */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/**
 * Default currency
 */
export const DEFAULT_CURRENCY = 'TWD';

/**
 * Get currency by code
 */
export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/**
 * Get currency symbol by code
 */
export function getCurrencySymbol(code: string): string {
  return getCurrency(code)?.symbol ?? code;
}

/**
 * Format amount with currency symbol
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  // 整數金額不補 .00(TWD 實務上不顯示分位),非整數最多兩位小數。
  const formatted = amount.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
  });
  return `${symbol}${formatted}`;
}
