import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatRate, localDate, money } from './format';
import type { AppLocale } from './messages';

const locales: AppLocale[] = ['zh', 'zh-CN', 'en', 'jp'];
describe('display formatting', () => {
  it.each(locales)('keeps cents, signs, separators and long amounts in %s', (locale) => {
    expect(money(0, locale)).toBe('NT$0');
    expect(money(0.01, locale)).toBe('NT$0.01');
    expect(money(-36.21, locale)).toBe('-NT$36.21');
    expect(money(1234.5, locale)).toBe('NT$1,234.5');
    expect(money(123456789.01, locale)).toBe('NT$123,456,789.01');
    expect(formatCurrency(33.33, 'JPY', locale)).toBe('¥33.33');
    expect(formatCurrency(3000, 'JPY', locale)).toBe('¥3,000');
    expect(formatCurrency(-12.5, 'USD', locale)).toBe('-$12.5');
    expect(formatCurrency(12.5, 'EUR', locale)).toBe('€12.5');
    expect(formatCurrency(12.5, 'HKD', locale)).toBe('HK$12.5');
    expect(formatCurrency(12.5, 'THB', locale)).toBe('฿12.5');
    expect(formatCurrency(1234.56, 'CHF', locale)).toBe('CHF 1,234.56');
    expect(formatCurrency(1, 'NOT-A-CODE', locale)).toBe('NOT-A-CODE 1');
    expect(formatCurrency(1, 'constructor', locale)).toBe('constructor 1');
  });
  it.each(locales)('renders date-only components without a timezone in %s', (locale) => {
    const zone = process.env.TZ;
    try {
      for (const tz of ['Pacific/Honolulu', 'Asia/Tokyo', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        expect(formatDate('2026-10-07', locale)).toBe(
          locale === 'en' ? 'Oct 7, 2026' : '2026年10月7日'
        );
        expect(formatDate('2024-02-29', locale)).toBe(
          locale === 'en' ? 'Feb 29, 2024' : '2024年2月29日'
        );
      }
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
    expect(formatDate('legacy date', locale)).toBe('legacy date');
  });
  it('formats small exchange rates without exponent notation', () => {
    expect(formatRate(0.0333)).toBe('0.0333');
    expect(formatRate(1)).toBe('1');
    expect(formatRate(0.00000123)).toBe('0.00000123');
    expect(formatRate(32.4567)).toBe('32.4567');
  });
  it('reads the input calendar date in the device time zone', () => {
    expect(localDate(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
    expect(localDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
});

it.each(locales)(
  'identifies original currencies once and keeps their cents in %s',
  async (locale) => {
    const { formatOriginalAmount } = await import('./format');
    for (const code of ['KRW', 'SGD', 'GBP']) {
      expect(formatOriginalAmount(10000.25, code, locale)).toBe(`${code} 10,000.25`);
    }
    for (const [code, symbol] of [
      ['JPY', '¥'],
      ['USD', '$'],
      ['EUR', '€'],
      ['HKD', 'HK$'],
      ['THB', '฿'],
    ]) {
      expect(formatOriginalAmount(10.01, code, locale)).toBe(`${code} · ${symbol}10.01`);
    }
  }
);
it.each(locales)(
  'suppresses a minus only when the displayed amount rounds to zero in %s',
  (locale) => {
    for (const value of [-0, -0.001, -0.0049, 0, 0.001]) expect(money(value, locale)).toBe('NT$0');
    expect(money(-0.005, locale)).toBe('-NT$0.01');
    expect(money(-0.01, locale)).toBe('-NT$0.01');
    expect(money(0.01, locale)).toBe('NT$0.01');
    expect(formatCurrency(-0.001, 'KRW', locale)).toBe('KRW 0');
    expect(formatCurrency(-0.01, 'JPY', locale)).toBe('-¥0.01');
  }
);
