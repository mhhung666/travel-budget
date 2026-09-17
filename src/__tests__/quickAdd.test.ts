import { describe, expect, it } from 'vitest';
import type { TripWithMembers } from '@/types';
import { decideQuickAddTrip, rankQuickAddTrips, tripIdFromPath } from '@/lib/quickAdd';

const makeTrip = (id: string, overrides: Partial<TripWithMembers> = {}): TripWithMembers => ({
  id,
  hash_code: `hash-${id}`,
  name: id,
  description: null,
  start_date: null,
  end_date: null,
  destination_location: null,
  created_at: '2026-01-01T00:00:00.000Z',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
  member_count: 1,
  my_spent: 0,
  my_balance: 0,
  ...overrides,
});

describe('quick-add trip selection', () => {
  const now = new Date('2026-07-10T12:00:00');

  it('directly chooses the only ongoing trip even when other active trips exist', () => {
    const ongoing = makeTrip('ongoing', {
      start_date: '2026-07-08',
      end_date: '2026-07-12',
    });
    const upcoming = makeTrip('upcoming', {
      start_date: '2026-08-01',
      end_date: '2026-08-05',
    });

    expect(decideQuickAddTrip([upcoming, ongoing], now)).toMatchObject({
      kind: 'direct',
      trip: { id: 'ongoing' },
    });
  });

  it('asks the user to pick when multiple trips are ongoing', () => {
    const first = makeTrip('first', {
      start_date: '2026-07-08',
      end_date: '2026-07-12',
    });
    const second = makeTrip('second', {
      start_date: '2026-07-09',
      end_date: '2026-07-11',
    });

    expect(decideQuickAddTrip([first, second], now).kind).toBe('pick');
  });

  it('directly chooses the sole unarchived trip and ignores archived trips', () => {
    const active = makeTrip('active');
    const archived = makeTrip('archived', { archived_at: '2026-07-01T00:00:00.000Z' });

    expect(decideQuickAddTrip([archived, active], now)).toMatchObject({
      kind: 'direct',
      trip: { id: 'active' },
    });
  });

  it('returns none when no usable trip exists', () => {
    const archived = makeTrip('archived', { archived_at: '2026-07-01T00:00:00.000Z' });
    expect(decideQuickAddTrip([archived], now)).toEqual({ kind: 'none', trips: [] });
  });

  it('ranks ongoing, nearest upcoming, recently ended, then undated trips', () => {
    const trips = [
      makeTrip('undated'),
      makeTrip('far-upcoming', { start_date: '2026-09-01', end_date: '2026-09-04' }),
      makeTrip('recent-past', { start_date: '2026-06-01', end_date: '2026-07-05' }),
      makeTrip('near-upcoming', { start_date: '2026-07-20', end_date: '2026-07-22' }),
      makeTrip('ongoing', { start_date: '2026-07-08', end_date: '2026-07-12' }),
    ];

    expect(rankQuickAddTrips(trips, now).map((trip) => trip.id)).toEqual([
      'ongoing',
      'near-upcoming',
      'far-upcoming',
      'recent-past',
      'undated',
    ]);
  });

  it('remembers the last choice within the same safety group', () => {
    const nearer = makeTrip('nearer', {
      start_date: '2026-07-20',
      end_date: '2026-07-22',
    });
    const preferred = makeTrip('preferred', {
      start_date: '2026-08-01',
      end_date: '2026-08-04',
    });

    expect(rankQuickAddTrips([nearer, preferred], now, preferred.id)[0].id).toBe('preferred');
  });

  describe('inside a trip', () => {
    const ongoing = makeTrip('ongoing', { start_date: '2026-07-08', end_date: '2026-07-12' });
    const upcoming = makeTrip('upcoming', { start_date: '2026-08-01', end_date: '2026-08-05' });
    const other = makeTrip('other');

    it('records to the trip being viewed instead of asking, by id or hash code', () => {
      const trips = [ongoing, upcoming, other];
      // 沒有目前旅行時這組會跳 picker；在旅行內則直接帶入。
      expect(decideQuickAddTrip([upcoming, other], now).kind).toBe('pick');
      for (const idOrCode of ['upcoming', 'hash-upcoming']) {
        const decision = decideQuickAddTrip(trips, now, 'other', idOrCode);
        expect(decision).toMatchObject({ kind: 'direct', trip: { id: 'upcoming' } });
        // 切換旅行清單仍列出全部候選，目前這趟排第一。
        expect(decision.trips.map((trip) => trip.id)).toEqual(['upcoming', 'ongoing', 'other']);
      }
    });

    it('still records to an archived trip being viewed', () => {
      const archived = makeTrip('archived', { archived_at: '2026-07-01T00:00:00.000Z' });
      const decision = decideQuickAddTrip([archived, ongoing], now, null, 'hash-archived');
      expect(decision).toMatchObject({ kind: 'direct', trip: { id: 'archived' } });
      expect(decision.trips.map((trip) => trip.id)).toEqual(['archived', 'ongoing']);
    });

    it('falls back to the usual rule when the viewed trip is not one of mine', () => {
      expect(decideQuickAddTrip([upcoming, other], now, null, 'hash-shared').kind).toBe('pick');
    });

    it('reads the trip from trip-space paths only', () => {
      expect(tripIdFromPath('/trips/abc123')).toBe('abc123');
      expect(tripIdFromPath('/trips/abc123/expenses')).toBe('abc123');
      expect(tripIdFromPath('/trips')).toBeNull();
      expect(tripIdFromPath('/stats')).toBeNull();
      expect(tripIdFromPath('/quick-add')).toBeNull();
    });
  });
});
