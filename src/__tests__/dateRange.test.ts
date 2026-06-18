import { describe, it, expect } from 'vitest';
import { tripOverlapsRange } from '@/lib/dateRange';

const d = (s: string) => new Date(s);

describe('tripOverlapsRange', () => {
  const rangeStart = d('2026-04-01');
  const rangeEnd = d('2026-04-30T23:59:59.999');

  it('returns true when no range is given (no filtering)', () => {
    expect(tripOverlapsRange(d('2020-01-01'), d('2020-01-05'), null, null)).toBe(true);
    // 連無日期的旅程也視為符合
    expect(tripOverlapsRange(null, null, null, null)).toBe(true);
  });

  it('excludes undated trips when a range is active', () => {
    expect(tripOverlapsRange(null, null, rangeStart, rangeEnd)).toBe(false);
  });

  it('keeps a trip fully inside the range', () => {
    expect(tripOverlapsRange(d('2026-04-10'), d('2026-04-20'), rangeStart, rangeEnd)).toBe(true);
  });

  it('keeps a trip that partially overlaps either edge', () => {
    expect(tripOverlapsRange(d('2026-03-20'), d('2026-04-05'), rangeStart, rangeEnd)).toBe(true);
    expect(tripOverlapsRange(d('2026-04-25'), d('2026-05-10'), rangeStart, rangeEnd)).toBe(true);
  });

  it('drops a trip entirely before or after the range', () => {
    expect(tripOverlapsRange(d('2026-02-01'), d('2026-03-01'), rangeStart, rangeEnd)).toBe(false);
    expect(tripOverlapsRange(d('2026-05-01'), d('2026-05-10'), rangeStart, rangeEnd)).toBe(false);
  });

  it('falls back to the single present endpoint when one side is missing', () => {
    expect(tripOverlapsRange(d('2026-04-15'), null, rangeStart, rangeEnd)).toBe(true);
    expect(tripOverlapsRange(null, d('2026-04-15'), rangeStart, rangeEnd)).toBe(true);
    expect(tripOverlapsRange(d('2026-01-15'), null, rangeStart, rangeEnd)).toBe(false);
  });

  it('supports an open-ended range (only one bound set)', () => {
    expect(tripOverlapsRange(d('2026-06-01'), d('2026-06-10'), rangeStart, null)).toBe(true);
    expect(tripOverlapsRange(d('2026-01-01'), d('2026-01-10'), rangeStart, null)).toBe(false);
    expect(tripOverlapsRange(d('2026-01-01'), d('2026-01-10'), null, rangeEnd)).toBe(true);
  });
});
