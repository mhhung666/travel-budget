import type { Trip } from '@/api/contracts';
import { displayLocales, formatDate } from '@/i18n/format';
import type { AppLocale, Messages } from '@/i18n/messages';

/** Card-only presentation; no changes to ledger amounts or shared money formatting. */
export function cardNumber(amount: number, locale: AppLocale) {
  return new Intl.NumberFormat(displayLocales[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}
export function cardMoney(amount: number, currency: string, locale: AppLocale) {
  return `${cardNumber(amount, locale)} ${currency}`;
}
export function cardDates(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  t: Messages,
  locale: AppLocale
) {
  const { startDate: start, endDate: end } = trip;
  if (!start && !end) return t.unscheduled;
  if (!start || !end)
    return `${t.startDate}: ${start ? formatDate(start, locale) : t.notSet} · ${t.endDate}: ${end ? formatDate(end, locale) : t.notSet}`;
  if (start === end) return formatDate(start, locale);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const last =
    sameYear && locale !== 'en'
      ? formatDate(end, locale).replace(/^\d+年/, '')
      : formatDate(end, locale);
  return `${formatDate(start, locale)} – ${last}`;
}
export function cardPhase(trip: Pick<Trip, 'phase' | 'archived'>, t: Messages) {
  const phase = trip.phase === 'unscheduled' ? t.unscheduledPhase : t[trip.phase];
  return trip.archived ? `${t.archived}${trip.phase === 'past' ? '' : ` · ${phase}`}` : phase;
}
/** Conservative tabular-number width; the measured container, never the window, owns the choice. */
export function cardSummaryColumns(width: number, fontScale: number, digits = 9) {
  return width >= (Math.max(112, (digits + 1) * 13) * 2 + 24) * fontScale;
}
