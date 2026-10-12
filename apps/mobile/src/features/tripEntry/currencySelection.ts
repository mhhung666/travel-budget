import type { AppLocale } from '@/i18n/messages';
import { currencyMessages } from '@/i18n/currencyMessages';
import { displayLocales } from '@/i18n/format';

export const commonCurrencyCodes = [
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
] as const;
export interface CurrencyOption {
  code: string;
  label: string;
  englishLabel: string;
  common: boolean;
}
function intlName(code: string, locale: AppLocale) {
  try {
    return new Intl.DisplayNames([displayLocales[locale]], { type: 'currency' }).of(code) || code;
  } catch {
    return code;
  }
}
export function currencyName(code: string, locale: AppLocale) {
  return currencyMessages[locale].names[code] ?? intlName(code, locale);
}
/** The server's advertised set owns membership; Intl only supplies display names. */
export function baseCurrencyCodes(
  capabilities:
    | {
        nonTwdCreationEnabled: boolean;
        supportedBaseCurrencies: readonly string[];
      }
    | undefined
): string[] {
  if (!capabilities) return [];
  return [...new Set(capabilities.supportedBaseCurrencies)].filter(
    (code) => capabilities.nonTwdCreationEnabled || code === 'TWD'
  );
}
export function currencyOptions(codes: readonly string[], locale: AppLocale): CurrencyOption[] {
  const allowed = new Set(codes);
  const common = commonCurrencyCodes.filter((code) => allowed.has(code));
  const commonSet = new Set<string>(common);
  return [...common, ...[...allowed].filter((code) => !commonSet.has(code)).sort()].map((code) => ({
    code,
    label: currencyName(code, locale),
    englishLabel: currencyName(code, 'en'),
    common: commonSet.has(code),
  }));
}
export const normalizeCurrencySearch = (search: string) => search.trim().toLowerCase();
export function searchCurrencies(options: readonly CurrencyOption[], search: string) {
  const term = normalizeCurrencySearch(search);
  if (!term) return [...options];
  const buckets: CurrencyOption[][] = [[], [], []];
  for (const option of options) {
    const code = option.code.toLowerCase();
    if (code === term) buckets[0].push(option);
    else if (code.startsWith(term)) buckets[1].push(option);
    else if (
      code.includes(term) ||
      option.label.toLowerCase().includes(term) ||
      option.englishLabel.toLowerCase().includes(term)
    )
      buckets[2].push(option);
  }
  return buckets.flat();
}
