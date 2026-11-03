import { dateFromLocalDateKey } from '@/lib/tripStatus';

const intlLocale = (locale: string) =>
  locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'en' ? 'en-US' : locale;

/** List-card presentation only; ledger precision and other money formatters stay unchanged. */
export function cardNumber(amount: number, locale: string) {
  return Math.abs(amount).toLocaleString(intlLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function cardDates(start: string | null, end: string | null, locale: string) {
  const first = start && dateFromLocalDateKey(start.slice(0, 10));
  const last = end && dateFromLocalDateKey(end.slice(0, 10));
  if (!first || !last) return null;
  const format = (date: Date, year = true) =>
    date.toLocaleDateString(intlLocale(locale), {
      ...(year ? { year: 'numeric' as const } : {}),
      month: 'numeric',
      day: 'numeric',
    });
  return first.getTime() === last.getTime()
    ? format(first)
    : `${format(first)} – ${format(last, first.getFullYear() !== last.getFullYear())}`;
}
