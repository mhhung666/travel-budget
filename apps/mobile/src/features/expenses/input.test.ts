import { describe, expect, it } from 'vitest';
import { MAX_EXPENSE_AMOUNT } from '@/api/contracts';
import { addDays, isCalendarDate, parseAmount } from './input';

describe('parseAmount', () => {
  it.each([
    ['100', 100],
    ['100.5', 100.5],
    ['33.34', 33.34],
    ['0.01', 0.01],
    ['0.07', 0.07],
    ['  12.30  ', 12.3],
    ['007', 7],
    [String(MAX_EXPENSE_AMOUNT), MAX_EXPENSE_AMOUNT],
    ['999999999.99', 999999999.99],
  ])('accepts %j as %d', (text, amount) => {
    expect(parseAmount(text)).toEqual({ ok: true, amount });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['12abc', 'format'],
    ['abc', 'format'],
    ['1e3', 'format'],
    ['1,000', 'format'],
    ['1 000', 'format'],
    ['.5', 'format'],
    ['5.', 'format'],
    ['5..5', 'format'],
    ['1.234', 'format'],
    ['-5', 'format'],
    ['+5', 'format'],
    ['0x10', 'format'],
    ['Infinity', 'format'],
    ['NaN', 'format'],
    ['１２', 'format'],
    ['12.5.1', 'format'],
    ['0', 'zero'],
    ['0.00', 'zero'],
    ['0.0', 'zero'],
    ['1000000000.01', 'tooLarge'],
    ['10000000000000', 'tooLarge'],
    ['1'.repeat(400), 'tooLarge'],
  ])('rejects %j as %s', (text, reason) => {
    expect(parseAmount(text)).toEqual({ ok: false, reason });
  });

  it('never reads more than the typed text says', () => {
    // parseFloat('12abc') === 12 and parseFloat('1.239') === 1.239; neither may become an amount.
    for (const text of ['12abc', '1.239', '3 apples', '4,5']) {
      expect(parseAmount(text).ok).toBe(false);
    }
  });

  it('gives the amount the backend contract accepts, to the cent', () => {
    for (let cents = 1; cents <= 20_000; cents += 7) {
      const text = (cents / 100).toFixed(2);
      expect(parseAmount(text)).toEqual({ ok: true, amount: Number(text) });
    }
  });
});

describe('isCalendarDate', () => {
  it.each(['2026-10-04', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01'])(
    'accepts %s',
    (date) => expect(isCalendarDate(date)).toBe(true)
  );
  it.each([
    '2026-02-31',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '2026-10-32',
    '2026-1-04',
    '26-10-04',
    '2026/10/04',
    '2026-10-04T00:00:00Z',
    ' 2026-10-04',
    '0099-10-04',
    '',
    'today',
  ])('rejects %j', (date) => expect(isCalendarDate(date)).toBe(false));
});

describe('addDays', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('is independent of the device time zone and daylight saving days', () => {
    // These days are 23 or 25 hours long somewhere; calendar arithmetic must not care.
    for (const date of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01']) {
      expect(addDays(addDays(date, 1), -1)).toBe(date);
      expect(isCalendarDate(addDays(date, 1))).toBe(true);
    }
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
  it('keeps four-digit years', () => {
    expect(addDays('1000-01-01', -1)).toBe('0999-12-31');
  });
});
