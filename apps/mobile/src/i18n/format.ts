import type { AppLocale } from './messages';

export const displayLocales: Record<AppLocale, string> = {
  zh: 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en-US',
  jp: 'ja-JP',
};
const symbols: Record<string, string> = {
  TWD: 'NT$',
  JPY: '¥',
  USD: '$',
  EUR: '€',
  HKD: 'HK$',
  THB: '฿',
};
/** Display only: preserve cents for every currency, including JPY; never change stored amounts. */
export function formatCurrency(value: number, currency: string, locale: AppLocale = 'en') {
  const number = new Intl.NumberFormat(displayLocales[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const prefix = typeof symbols[currency] === 'string' ? symbols[currency] : `${currency} `;
  return `${value < 0 ? '-' : ''}${prefix}${number}`;
}
export const money = (value: number, locale: AppLocale = 'en') =>
  formatCurrency(value, 'TWD', locale);

/** Construct the calendar components directly; device time zones cannot move a date-only day. */
export function formatDate(value: string, locale: AppLocale = 'en') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (locale !== 'en') return `${year}年${month}月${day}日`;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return months[month - 1] ? `${months[month - 1]} ${day}, ${year}` : value;
}

/** Calendar date of an instant in the device time zone, as date-only text. */
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Exchange rates can be tiny (JPY → TWD); avoid exponent notation. */
export function formatRate(rate: number, locale: AppLocale = 'en') {
  return new Intl.NumberFormat(displayLocales[locale], { maximumFractionDigits: 8 }).format(rate);
}

/** An instant, unlike a date-only value: display its original deadline in the device time zone. */
export function formatInstant(value: number, locale: AppLocale = 'en') {
  return new Intl.DateTimeFormat(displayLocales[locale], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
