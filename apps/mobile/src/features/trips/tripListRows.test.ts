import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import type { Trip } from '@/api/contracts';
import { ApiError } from '@/api/client';
import { resetTripPages } from './tripListCache';
import { groupHeading, visibleTripRows, usableTripCounts } from './tripListRows';
const trip = (
  id: string,
  startDate: string | null,
  phase: Trip['phase'] = 'past',
  archived = false
): Trip => ({
  id,
  name: 'Long '.repeat(30),
  startDate,
  endDate: null,
  phase,
  archived,
  description: null,
  destination: null,
  memberCount: 2,
  mySpent: 1,
  myBalance: 0,
});
it('groups adjacent rows across more than two pages once, preserving server order and complete names', () => {
  const pages = [
    Array.from({ length: 20 }, (_, n) => trip(`a${n}`, '2026-01-01')),
    Array.from({ length: 20 }, (_, n) => trip(`b${n}`, '2026-01-01')),
    [trip('c', '2025-12-31'), trip('d', null)],
  ];
  const rows = visibleTripRows(pages.flat(), () => true);
  expect(rows.map((_, index) => groupHeading(rows, index)).filter(Boolean)).toEqual([
    '2026',
    '2025',
    'no-date',
  ]);
  expect(rows).toHaveLength(42);
  expect(rows[0].name).toBe(pages[0][0].name);
  expect(
    groupHeading([trip('a', '2026-10-12', 'ongoing'), trip('b', '2027-01-01', 'upcoming')], 1)
  ).toBeNull();
  expect(groupHeading([trip('a', '2026-10-12', 'ongoing', true)], 0)).toBe('2026');
});
it('deduplicates IDs and hides denied rows without changing archive or access state', () => {
  const a = trip('a', null),
    b = trip('b', null);
  expect(visibleTripRows([a, b, a], (id) => id !== 'b')).toEqual([a]);
  expect(usableTripCounts(undefined, true)).toBeUndefined();
});
it('refresh resets all list modes but leaves denied caches, other accounts and environments intact', async () => {
  const client = new QueryClient();
  const general = ['env', 'account', 'trips', '2026-10-12', 'v2', 'unarchived', 'list'];
  const archived = [...general.slice(0, 5), 'archived', 'list'];
  const quick = [...general.slice(0, 5), 'unarchived', 'quick-add'];
  const denied = [...general.slice(0, 5), 'all', 'legacy'];
  const other = ['env', 'other', 'trips'];
  const otherEnv = ['different', 'account', 'trips'];
  const data = {
    pages: [{ items: ['a'] }, { items: ['b'] }, { items: ['c'] }],
    pageParams: [1, 2, 3],
  };
  for (const key of [general, archived, quick, denied, other, otherEnv])
    client.setQueryData(key, data);
  const query = client.getQueryCache().find({ queryKey: denied })!;
  query.setState({ error: new ApiError('FORBIDDEN', 403), status: 'error' });
  resetTripPages(client, 'env', 'account');
  for (const key of [general, archived, quick])
    expect(client.getQueryData(key)).toEqual({ pages: [data.pages[0]], pageParams: [1] });
  for (const key of [denied, other, otherEnv]) expect(client.getQueryData(key)).toEqual(data);
  expect(client.getQueryState(denied)?.error).toMatchObject({ status: 403 });
  client.clear();
});
