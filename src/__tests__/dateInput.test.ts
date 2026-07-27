import { describe, expect, it } from 'vitest';
import { toDateInputValue, toLocalDateInputValue } from '@/lib/dateInput';

describe('toLocalDateInputValue', () => {
  it('uses the local calendar date in UTC+8 instead of the UTC date', () => {
    const instant = new Date('2026-07-26T17:30:00.000Z');
    expect(toLocalDateInputValue(instant, -8 * 60)).toBe('2026-07-27');
  });

  it('uses the local calendar date in UTC-7', () => {
    const instant = new Date('2026-07-27T03:30:00.000Z');
    expect(toLocalDateInputValue(instant, 7 * 60)).toBe('2026-07-26');
  });
});

describe('toDateInputValue', () => {
  it('preserves an existing date-only DTO value', () => {
    expect(toDateInputValue('2026-07-27')).toBe('2026-07-27');
  });

  it('strips the time from an ISO date-only DTO value without shifting the day', () => {
    expect(toDateInputValue('2026-07-27T00:00:00.000Z')).toBe('2026-07-27');
  });
});
