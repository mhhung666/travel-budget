import { describe, expect, it } from 'vitest';
import {
  dateForDayNumber,
  dayDiff,
  dayNumberForDate,
  firstUnusedDate,
  firstUnusedDayNumber,
  isCalendarDate,
  isDateWithinTrip,
  toDateOnly,
  tripDateList,
} from '@/lib/itineraryDayTarget';

describe('itineraryDayTarget', () => {
  it('accepts only real calendar days', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true); // 閏日
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-9-1')).toBe(false);
    expect(isCalendarDate('2026-09-01T00:00:00Z')).toBe(false);
  });

  it('normalizes dates without letting a device timezone shift the day', () => {
    expect(toDateOnly('2026-09-01T23:30:00+09:00')).toBe('2026-09-01');
    expect(toDateOnly(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01');
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly('not a date')).toBeNull();
  });

  it('maps dates to day numbers across months, years and DST changes', () => {
    expect(dayNumberForDate('2026-09-01', '2026-09-01')).toBe(1);
    expect(dayNumberForDate('2026-10-30', '2026-11-02')).toBe(4); // 跨月 + 歐洲 DST 結束
    expect(dayNumberForDate('2026-12-30', '2027-01-02')).toBe(4); // 跨年
    expect(dayNumberForDate('2024-02-27', '2024-03-01')).toBe(4); // 閏日
    expect(dateForDayNumber('2026-12-30', 4)).toBe('2027-01-02');
    expect(dayDiff('2026-09-01', '2026-08-31')).toBe(-1);
  });

  it('lists every date in the trip and rejects dates outside it', () => {
    expect(tripDateList('2026-09-01', '2026-09-03')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    // 只有開始日時上限未知，不編造範圍。
    expect(tripDateList('2026-09-01', null)).toEqual([]);
    expect(tripDateList('2026-09-03', '2026-09-01')).toEqual([]);

    expect(isDateWithinTrip('2026-09-01', '2026-09-01', '2026-09-03')).toBe(true);
    expect(isDateWithinTrip('2026-09-03', '2026-09-01', '2026-09-03')).toBe(true);
    expect(isDateWithinTrip('2026-09-04', '2026-09-01', '2026-09-03')).toBe(false);
    expect(isDateWithinTrip('2026-08-31', '2026-09-01', '2026-09-03')).toBe(false);
    // 只有開始日：當天或之後都可以。
    expect(isDateWithinTrip('2027-01-01', '2026-09-01', null)).toBe(true);
    expect(isDateWithinTrip('2026-09-01', null, '2026-09-03')).toBe(false);
  });

  it('defaults to the earliest date that has no day yet', () => {
    expect(firstUnusedDate('2026-09-01', '2026-09-05', [])).toBe('2026-09-01');
    expect(firstUnusedDate('2026-09-01', '2026-09-05', [1, 3])).toBe('2026-09-02');
    // 全部建立時沒有預設，由呼叫端改走「皆已建立」流程。
    expect(firstUnusedDate('2026-09-01', '2026-09-03', [1, 2, 3])).toBeNull();
    // 沒有結束日時仍給得出下一個可用日期。
    expect(firstUnusedDate('2026-09-01', null, [1, 2])).toBe('2026-09-03');
    expect(firstUnusedDate(null, '2026-09-05', [])).toBeNull();
  });

  it('defaults to the smallest unused day number when the trip has no start date', () => {
    expect(firstUnusedDayNumber([])).toBe(1);
    expect(firstUnusedDayNumber([1, 3])).toBe(2);
    expect(firstUnusedDayNumber([1, 2, 3])).toBe(4);
  });
});
