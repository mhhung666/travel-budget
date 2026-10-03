import { describe, expect, it } from 'vitest';
import { formatCurrency, formatRate, localDate, money } from './format';

describe('formatting', () => {
  it('keeps backend cent precision and the TWD code', () => {
    expect(money(50.01)).toMatch(/^TWD[\s ]50\.01$/);
    expect(money(1000)).toMatch(/^TWD[\s ]1,000$/);
    expect(money(0.1)).toMatch(/^TWD[\s ]0\.1$/);
    expect(money(-20.5)).toMatch(/^-TWD[\s ]20\.5$/);
  });
  it('formats other currencies by code and survives codes Intl rejects', () => {
    expect(formatCurrency(3000, 'JPY')).toMatch(/^JPY[\s ]3,000$/);
    expect(formatCurrency(12.5, 'USD')).toMatch(/^USD[\s ]12\.5$/);
    expect(formatCurrency(1, 'NOT-A-CODE')).toBe('1 NOT-A-CODE');
  });
  it('formats small exchange rates without exponent notation', () => {
    expect(formatRate(0.0333)).toBe('0.0333');
    expect(formatRate(1)).toBe('1');
    expect(formatRate(0.00000123)).toBe('0.00000123');
    expect(formatRate(32.4567)).toBe('32.4567');
  });
  it('reads the calendar date in the device time zone', () => {
    expect(localDate(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
    expect(localDate(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });
});
