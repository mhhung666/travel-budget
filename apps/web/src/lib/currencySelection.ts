import { COMMON_CURRENCY_CODES, getCurrencyLabel } from '@/constants/currencies';

export interface CurrencyOption {
  code: string;
  label: string;
  englishLabel: string;
  common: boolean;
}

/** Candidate membership belongs to the caller, never to the browser's Intl inventory. */
export function currencyOptions(
  codes: readonly string[],
  locale: string,
  commonNames: Readonly<Record<string, string>> = {}
): CurrencyOption[] {
  const allowed = new Set(codes);
  const common = COMMON_CURRENCY_CODES.filter((code) => allowed.has(code));
  const commonSet = new Set(common);
  const rest = [...allowed].filter((code) => !commonSet.has(code)).sort();
  return [...common, ...rest].map((code) => ({
    code,
    label: commonNames[code] ?? getCurrencyLabel(code, locale),
    englishLabel: getCurrencyLabel(code, 'en'),
    common: commonSet.has(code),
  }));
}

export const normalizeCurrencySearch = (search: string) => search.trim().toLowerCase();

/** Exact code, code prefix, then name/partial-code matches; ties retain the base order. */
export function searchCurrencies(
  options: readonly CurrencyOption[],
  search: string
): CurrencyOption[] {
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
