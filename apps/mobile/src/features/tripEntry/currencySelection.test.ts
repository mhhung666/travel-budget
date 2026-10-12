import { afterEach, expect, it, vi } from 'vitest';
import fixtures from '../../../../../test-fixtures/currency-selection.json';
import { currencyMessages } from '@/i18n/currencyMessages';
import type { AppLocale } from '@/i18n/messages';
import {
  baseCurrencyCodes,
  commonCurrencyCodes,
  currencyOptions,
  searchCurrencies,
} from './currencySelection';

afterEach(() => vi.unstubAllGlobals());
it('uses the common order and four-language labels specified for both clients', () => {
  expect([...commonCurrencyCodes]).toEqual(fixtures.commonOrder);
  for (const locale of Object.keys(currencyMessages) as AppLocale[])
    expect(Object.keys(currencyMessages[locale].names)).toEqual(fixtures.commonOrder);
});
it.each(fixtures.cases)('shared search $search in $codes', ({ codes, search, expected }) => {
  expect(
    searchCurrencies(currencyOptions(codes, 'en'), search).map((option) => option.code)
  ).toEqual(expected);
});
it.each(fixtures.localizedSearches)(
  'searches locale $locale names and English independently',
  ({ locale, search, code }) => {
    const options = currencyOptions(['USD', 'JPY', 'KRW'], locale as AppLocale);
    expect(searchCurrencies(options, search).map((option) => option.code)).toEqual([code]);
    expect(searchCurrencies(options, 'US Dollar').map((option) => option.code)).toEqual(['USD']);
  }
);
it('keeps server membership when Intl is absent or throws, and retains more than twelve results', () => {
  for (const DisplayNames of [
    undefined,
    class {
      constructor() {
        throw new Error('unsupported');
      }
    },
  ]) {
    vi.stubGlobal('Intl', { ...Intl, DisplayNames });
    const options = currencyOptions([...fixtures.commonOrder, 'AED', 'ZAR'], 'zh');
    expect(options).toHaveLength(17);
    expect(options.find((o) => o.code === 'AED')?.label).toBe('AED');
    expect(searchCurrencies(options, 'aed')[0].code).toBe('AED');
    expect(searchCurrencies(options, '美元')[0].code).toBe('USD');
    vi.unstubAllGlobals();
  }
});
it('does not invent a TWD option when capabilities are absent or exclude it', () => {
  expect(baseCurrencyCodes(undefined)).toEqual([]);
  expect(
    baseCurrencyCodes({ nonTwdCreationEnabled: false, supportedBaseCurrencies: ['USD'] })
  ).toEqual([]);
  expect(
    baseCurrencyCodes({
      nonTwdCreationEnabled: false,
      supportedBaseCurrencies: ['USD', 'TWD', 'TWD'],
    })
  ).toEqual(['TWD']);
  expect(
    baseCurrencyCodes({
      nonTwdCreationEnabled: true,
      supportedBaseCurrencies: ['USD', 'AED', 'USD'],
    })
  ).toEqual(['USD', 'AED']);
});
