import { MAX_EXPENSE_AMOUNT, isPositiveCentAmount } from '@/api/contracts';

export type AmountResult =
  { ok: true; amount: number } | { ok: false; reason: 'empty' | 'format' | 'zero' | 'tooLarge' };

/**
 * Reads typed original-amount text without guessing (TWD additionally keeps its amount limit): digits with an optional point and one or two decimals,
 * nothing else. `parseFloat` would quietly turn "12abc" or "1e3" into a number; here they fail.
 */
export function parseAmount(text: string, currency = 'TWD', base = 'TWD'): AmountResult {
  const value = text.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { ok: false, reason: 'format' };
  const amount = Number(value);
  if (
    (currency === base && amount > MAX_EXPENSE_AMOUNT) ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    return { ok: false, reason: 'tooLarge' };
  if (
    !(currency === base
      ? isPositiveCentAmount(amount)
      : amount >= 0.01 && Math.round(amount * 100) / 100 === amount)
  )
    return { ok: false, reason: 'zero' };
  return { ok: true, amount };
}

/** A real calendar day in YYYY-MM-DD. `new Date('2026-02-31')` would roll over to March, so check. */
export function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Calendar arithmetic on date-only text; no time zone or daylight saving is involved. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(shifted.getUTCFullYear()).padStart(4, '0'),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** No truncation or precision rounding: preserve String(number), including tiny/large exponents. */
export function parseRate(text: string): number | null {
  if (!/^\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text.trim())) return null;
  const rate = Number(text);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
