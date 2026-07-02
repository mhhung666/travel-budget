import { describe, expect, it } from 'vitest';
import { ongoingDayNumber } from '@/lib/tripStatus';

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
