import { describe, it, expect } from 'vitest';
import { sortActivities } from '@/lib/itineraryActivities';

type A = { time: string | null; title: string };

describe('sortActivities', () => {
  it('orders timed activities ascending by HH:mm', () => {
    const input: A[] = [
      { time: '14:30', title: 'lunch' },
      { time: '09:00', title: 'museum' },
      { time: '21:05', title: 'bar' },
    ];
    expect(sortActivities(input).map((a) => a.title)).toEqual(['museum', 'lunch', 'bar']);
  });

  it('places untimed activities last, preserving their relative order', () => {
    const input: A[] = [
      { time: null, title: 'untimed-1' },
      { time: '10:00', title: 'timed' },
      { time: null, title: 'untimed-2' },
    ];
    expect(sortActivities(input).map((a) => a.title)).toEqual([
      'timed',
      'untimed-1',
      'untimed-2',
    ]);
  });

  it('keeps stable order for equal times', () => {
    const input: A[] = [
      { time: '08:00', title: 'first' },
      { time: '08:00', title: 'second' },
      { time: '08:00', title: 'third' },
    ];
    expect(sortActivities(input).map((a) => a.title)).toEqual(['first', 'second', 'third']);
  });

  it('compares zero-padded times correctly (09:00 before 10:00)', () => {
    const input: A[] = [
      { time: '10:00', title: 'ten' },
      { time: '09:00', title: 'nine' },
    ];
    expect(sortActivities(input).map((a) => a.title)).toEqual(['nine', 'ten']);
  });

  it('does not mutate the input array', () => {
    const input: A[] = [
      { time: '12:00', title: 'b' },
      { time: '08:00', title: 'a' },
    ];
    const copy = [...input];
    sortActivities(input);
    expect(input).toEqual(copy);
  });

  it('returns an empty array unchanged', () => {
    expect(sortActivities([])).toEqual([]);
  });
});
