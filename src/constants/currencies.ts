export interface Currency {
  code: string;
  symbol: string;
  nameKey: string; // i18n key for the currency name
}

/**
 * Supported currencies with i18n keys for names
 */
export const CURRENCIES: Currency[] = [
  { code: 'TWD', symbol: 'NT$', nameKey: 'currency.TWD' },
  { code: 'JPY', symbol: '¥', nameKey: 'currency.JPY' },
  { code: 'USD', symbol: '$', nameKey: 'currency.USD' },
  { code: 'EUR', symbol: '€', nameKey: 'currency.EUR' },
  { code: 'HKD', symbol: 'HK$', nameKey: 'currency.HKD' },
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
  const formatted = amount.toLocaleString('zh-TW', {
    minimumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
    maximumFractionDigits: currencyCode === 'JPY' ? 0 : 2,
  });
  return `${symbol}${formatted}`;
}
