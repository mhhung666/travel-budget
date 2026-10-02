import { describe, expect, it } from 'vitest';
import { getTripCardStatus, getTripPhase, ongoingDayNumber } from '@/lib/tripStatus';

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

describe('getTripCardStatus', () => {
  const now = new Date('2026-07-10T12:00:00');
  const trip = (overrides: Partial<Parameters<typeof getTripCardStatus>[0]> = {}) => ({
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    archived_at: null,
    my_spent: 0,
    my_balance: 0,
    ...overrides,
  });

  it('標出即將出發、旅行中與天數', () => {
    expect(
      getTripCardStatus(trip({ start_date: '2026-07-20', end_date: '2026-07-25' }), now)
    ).toEqual({ kind: 'upcoming', daysUntil: 10 });
    expect(
      getTripCardStatus(trip({ start_date: '2026-07-08', end_date: '2026-07-12' }), now)
    ).toEqual({ kind: 'ongoing', day: 3 });
  });

  it('結束後依我的餘額分待結算／已結清，沒花費不標', () => {
    expect(getTripCardStatus(trip({ my_spent: 100, my_balance: -50 }), now).kind).toBe(
      'pendingSettlement'
    );
    expect(getTripCardStatus(trip({ my_spent: 100, my_balance: 0.004 }), now).kind).toBe('settled');
    expect(getTripCardStatus(trip(), now).kind).toBe('none');
  });

  it('封存、無日期、只有出發日的舊旅行不標', () => {
    expect(getTripCardStatus(trip({ archived_at: '2026-07-06', my_balance: 10 }), now).kind).toBe(
      'none'
    );
    expect(getTripCardStatus(trip({ start_date: null, end_date: null }), now).kind).toBe('none');
    expect(getTripCardStatus(trip({ end_date: null }), now).kind).toBe('none');
  });
});
