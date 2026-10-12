import { expect, it } from 'vitest';
import type { Trip } from '@/api/contracts';
import type { DraftTrip } from '@/storage/draftTrips';
import { hex } from '@/test/expenseServer';
import { onlineCandidates, localCandidates } from './tripCandidates';
const trip = (n: number): Trip => ({
  id: hex(n),
  name: `Full trip ${n} ${'long name '.repeat(20)}`,
  startDate: '2026-10-12',
  endDate: '2026-10-13',
  phase: 'ongoing',
  archived: false,
  description: null,
  destination: null,
  memberCount: 1,
  mySpent: 99,
  myBalance: 12,
});
it('keeps server quick-add order across three pages, full names/dates/phases and stable ID deduplication', () => {
  const pages = [
    Array.from({ length: 20 }, (_, n) => trip(n + 1)),
    Array.from({ length: 20 }, (_, n) => trip(n + 21)),
    [trip(41), trip(1)],
  ];
  pages[0][1].archived = true;
  const rows = onlineCandidates(pages.flat(), (id) => id !== hex(3));
  expect(rows).toHaveLength(39);
  expect(rows.map((r) => r.id)).toEqual(
    pages
      .flat()
      .slice(0, 41)
      .filter((t) => !t.archived && t.id !== hex(3))
      .map((t) => t.id)
  );
  expect(rows[0]).toEqual({ id: hex(1), name: pages[0][0].name, trip: pages[0][0] });
});
it('keeps old unknown snapshots and archived trips explicitly selectable without inventing dates or changing options', () => {
  const scope = { environment: 'env', accountId: hex(1) };
  const options = { members: [], categories: ['food' as const] };
  const local = (n: number, archived: boolean | null): DraftTrip => ({
    ...scope,
    tripId: hex(n),
    name: n === 1 ? null : `Local ${n}`,
    options,
    archived,
    updatedAt: n,
  });
  const input = [
    local(1, null),
    local(2, true),
    local(3, false),
    local(4, true),
    { ...local(5, false), options: null },
  ];
  const rows = localCandidates(input, (id) => id !== hex(4), 'Cached trip');
  expect(rows).toEqual([
    { id: hex(3), name: 'Local 3', localGroup: 'general' },
    { id: hex(2), name: 'Local 2', localGroup: 'archived' },
    { id: hex(1), name: 'Cached trip', localGroup: 'unknown' },
  ]);
  expect(rows.every((r) => !r.trip)).toBe(true);
  expect(input[1].options).toBe(options);
});

it('uses full metadata, never page length or preference, for a direct choice', async () => {
  const { directCandidate } = await import('./tripCandidates');
  const meta = (candidateCount: number, ongoingCount: number, directTripId: string | null) => ({
    archive: 'unarchived' as const,
    sort: 'quick-add' as const,
    date: '2026-10-12',
    counts: { unarchived: candidateCount, archived: 0 },
    quickAdd: { candidateCount, ongoingCount, directTripId },
  });
  const rows = onlineCandidates([trip(1)], () => true);
  expect(directCandidate(meta(41, 2, null), rows)).toBeNull();
  expect(directCandidate(undefined, rows)).toBeNull();
  expect(directCandidate(meta(41, 1, trip(1).id), rows)).toBe(trip(1).id);
  expect(directCandidate(meta(1, 0, trip(1).id), rows)).toBe(trip(1).id);
  expect(directCandidate(meta(41, 2, trip(1).id), rows)).toBeNull();
  expect(directCandidate(meta(1, 0, trip(2).id), rows)).toBeNull();
});
