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

// ---------------------------------------------------------------------------
// 完整幣別清單（ISO 4217，經 Intl 動態取得，不限上方精選 6 種）
// ---------------------------------------------------------------------------

/** 常用幣別：於完整清單與搜尋結果中優先排在前面。 */
const COMMON_CURRENCY_CODES = [
  'TWD',
  'JPY',
  'USD',
  'EUR',
  'HKD',
  'THB',
  'KRW',
  'CNY',
  'GBP',
  'SGD',
  'AUD',
  'MYR',
  'VND',
  'PHP',
  'IDR',
];

/** app locale → Intl BCP47 locale（幣別名稱本地化用）。 */
function toIntlLocale(locale: string): string {
  return locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja' : locale === 'zh-CN' ? 'zh-CN' : 'en';
}

/**
 * 全部支援的 ISO 4217 幣別代碼（常用排前、其餘照 Intl 的字母序）。
 * Intl.supportedValuesOf 不可用時退回精選 6 種。
 */
export function getAllCurrencyCodes(): string[] {
  let all: string[];
  try {
    all = Intl.supportedValuesOf('currency');
  } catch {
    return [...CURRENCY_CODES];
  }
  const set = new Set(all);
  const common = COMMON_CURRENCY_CODES.filter((c) => set.has(c));
  const commonSet = new Set(common);
  const rest = all.filter((c) => !commonSet.has(c));
  return [...common, ...rest];
}

/** 供驗證用：可接受的幣別代碼集合。 */
export const SUPPORTED_CURRENCY_CODES: ReadonlySet<string> = new Set(getAllCurrencyCodes());

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCY_CODES.has(code);
}

/**
 * 幣別的本地化名稱（如 'JPY' → '日圓' / 'Japanese Yen'）。
 * Intl.DisplayNames 不可用或查無時退回代碼本身。
 */
export function getCurrencyLabel(code: string, locale: string): string {
  try {
    const dn = new Intl.DisplayNames([toIntlLocale(locale)], { type: 'currency' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}
