import { MAX_EXPENSE_AMOUNT, isPositiveCentAmount } from '@/api/contracts';

export type AmountResult =
  { ok: true; amount: number } | { ok: false; reason: 'empty' | 'format' | 'zero' | 'tooLarge' };

/**
 * Reads typed TWD text without guessing: digits with an optional point and one or two decimals,
 * nothing else. `parseFloat` would quietly turn "12abc" or "1e3" into a number; here they fail.
 */
export function parseAmount(text: string): AmountResult {
  const value = text.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { ok: false, reason: 'format' };
  const amount = Number(value);
  if (amount > MAX_EXPENSE_AMOUNT) return { ok: false, reason: 'tooLarge' };
  if (!isPositiveCentAmount(amount)) return { ok: false, reason: 'zero' };
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
