import { describe, expect, it } from 'vitest';
import { getTripPhase, ongoingDayNumber } from '@/lib/tripStatus';

describe('ongoingDayNumber', () => {
  const noon = (d: string) => new Date(`${d}T12:00:00`);

  it('出發日當天是 Day 1', () => {
    expect(ongoingDayNumber('2026-07-01', '2026-07-05', noon('2026-07-01'))).toBe(1);
  });

  it('旅程中段回傳正確天數', () => {
    expect(ongoingDayNumber('2026-07-01', '2026-07-05', noon('2026-07-03'))).toBe(3);
  });

  it('結束日當天仍算進行中（最後一天）', () => {
    expect(ongoingDayNumber('2026-07-01', '2026-07-05', noon('2026-07-05'))).toBe(5);
  });

  it('出發前與結束翌日回傳 null', () => {
    expect(ongoingDayNumber('2026-07-01', '2026-07-05', noon('2026-06-30'))).toBeNull();
    expect(ongoingDayNumber('2026-07-01', '2026-07-05', noon('2026-07-06'))).toBeNull();
  });

  it('缺日期或無效日期回傳 null', () => {
    expect(ongoingDayNumber(null, '2026-07-05', noon('2026-07-03'))).toBeNull();
    expect(ongoingDayNumber('2026-07-01', null, noon('2026-07-03'))).toBeNull();
    expect(ongoingDayNumber('not-a-date', '2026-07-05', noon('2026-07-03'))).toBeNull();
  });
});

describe('getTripPhase', () => {
  const noon = (d: string) => new Date(`${d}T12:00:00`);

  it('returns pre-trip with the number of calendar days until departure', () => {
    expect(getTripPhase('2026-07-10', '2026-07-15', noon('2026-07-07'))).toEqual({
      phase: 'preTrip',
      day: null,
      daysUntil: 3,
    });
  });

  it('returns the active trip day during the trip', () => {
    expect(getTripPhase('2026-07-10', '2026-07-15', noon('2026-07-12'))).toEqual({
      phase: 'ongoing',
      day: 3,
      daysUntil: null,
    });
  });

  it('returns post-trip after the end date', () => {
    expect(getTripPhase('2026-07-10', '2026-07-15', noon('2026-07-16')).phase).toBe('postTrip');
  });

  it('treats an undated trip as planning before the trip', () => {
    expect(getTripPhase(null, null, noon('2026-07-16'))).toEqual({
      phase: 'preTrip',
      day: null,
      daysUntil: null,
    });
  });

  it('does not normalize impossible calendar dates', () => {
    expect(getTripPhase('2026-02-30', '2026-03-02', noon('2026-02-28'))).toEqual({
      phase: 'preTrip',
      day: null,
      daysUntil: null,
    });
  });
});
