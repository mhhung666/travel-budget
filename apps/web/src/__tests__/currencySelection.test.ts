import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMON_CURRENCY_CODES } from '@/constants/currencies';
import { currencyOptions, searchCurrencies } from '@/lib/currencySelection';
import fixture from '../../../../test-fixtures/currency-selection.json';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import en from '@/i18n/messages/en.json';
import jp from '@/i18n/messages/jp.json';

const catalogs = { zh, 'zh-CN': cn, en, jp };
afterEach(() => vi.restoreAllMocks());

it('uses the shared common order', () => {
  expect(COMMON_CURRENCY_CODES).toEqual(fixture.commonOrder);
});

describe.each(Object.entries(catalogs))('%s search contract', (locale, catalog) => {
  it.each(fixture.cases)('searches $search in $codes', ({ codes, search, expected }) => {
    const options = currencyOptions(codes, locale, catalog.currencyPicker.names);
    expect(searchCurrencies(options, search).map((option) => option.code)).toEqual(expected);
  });
});

it.each(fixture.localizedSearches)('finds $search in $locale', ({ locale, search, code }) => {
  const catalog = catalogs[locale as keyof typeof catalogs];
  const options = currencyOptions(fixture.commonOrder, locale, catalog.currencyPicker.names);
  expect(searchCurrencies(options, search).map((option) => option.code)).toContain(code);
});

it('uses names for non-common currencies too', () => {
  const options = currencyOptions(['AED', 'USD'], 'zh');
  expect(options.find((option) => option.code === 'AED')?.label).not.toBe('AED');
  expect(searchCurrencies(options, 'United Arab Emirates').map((option) => option.code)).toEqual([
    'AED',
  ]);
});

it('puts exact code before prefix, before name, retaining common order within ties', () => {
  const options = currencyOptions(['USD', 'USN', 'TWD', 'AUD'], 'en', {
    TWD: 'US dollar name alias',
  });
  expect(searchCurrencies(options, 'USD').map((option) => option.code)).toEqual(['USD']);
  expect(searchCurrencies(options, 'US').map((option) => option.code)).toEqual([
    'USD',
    'USN',
    'TWD',
    'AUD',
  ]);
});

it('does not ask Intl which supplied codes are allowed', () => {
  const inventory = vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
    throw new Error('No inventory');
  });
  expect(currencyOptions(['AED', 'BHD', 'USD'], 'zh').map((option) => option.code)).toEqual([
    'USD',
    'AED',
    'BHD',
  ]);
  expect(inventory).not.toHaveBeenCalled();
});

it('keeps every candidate when DisplayNames fails, and retains localized common names', () => {
  vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => {
    throw new Error('No names');
  });
  const options = currencyOptions(['AED', 'USD', 'BHD'], 'zh', zh.currencyPicker.names);
  expect(options.map((option) => option.code)).toEqual(['USD', 'AED', 'BHD']);
  expect(options.find((option) => option.code === 'AED')?.label).toBe('AED');
  expect(searchCurrencies(options, 'bhd').map((option) => option.code)).toEqual(['BHD']);
  expect(searchCurrencies(options, '美元').map((option) => option.code)).toEqual(['USD']);
});

it('does not inject a default when the source is empty or lacks TWD', () => {
  expect(currencyOptions([], 'en')).toEqual([]);
  expect(currencyOptions(['AED'], 'en').map((option) => option.code)).toEqual(['AED']);
});

it('does not mutate the caller list or base ordering during search', () => {
  const codes = Object.freeze(['USD', 'AED', 'TWD', 'USD']);
  const options = currencyOptions(codes, 'en');
  const original = structuredClone(options);
  searchCurrencies(options, 'usd');
  expect(options).toEqual(original);
  expect(codes).toEqual(['USD', 'AED', 'TWD', 'USD']);
});
