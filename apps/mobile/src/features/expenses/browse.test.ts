import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { ExpenseSearchFilters, ExpenseSearchResult } from '@travel-budget/contracts';
import { ApiError } from '@/api/client';
import { ExpenseBrowseRegistry, registerExpenseBrowsers } from './browse';
import { ExpenseSearchReader } from './search';
import { refreshTripData } from './entryQueries';
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: vi.fn() }));
const revision = 'a'.repeat(64);
const page = (filters: ExpenseSearchFilters, n = 1): ExpenseSearchResult => ({
  filters,
  revision,
  ledger: { baseCurrency: 'USD', moneyScale: 2 },
  items: [
    {
      id: String(n).padStart(24, '0'),
      date: '2026-10-10',
      description: 'coffee',
      category: 'food',
      payerId: null,
      payerName: '',
      amount: 1,
      originalAmount: 1,
      currency: 'USD',
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
    },
  ],
  nextCursor: revision + '.20',
  payers: [],
  summary: { count: 48, total: 48, mySpent: 20, members: [], categories: [] },
});
function setup() {
  const read = vi.fn(async (filters: ExpenseSearchFilters) => page(filters));
  const registry = new ExpenseBrowseRegistry(
    () => new ExpenseSearchReader({ guard: async () => () => {}, read, failure: async () => {} })
  );
  return { read, registry, session: registry.get('trip') };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
async function tick() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
it('ordinary browsing, opening tools and typing do not issue a full-trip request; invalid dates stay editable', async () => {
  const { read, session } = setup();
  session.tools();
  session.fields({ keyword: 'c' });
  session.fields({ keyword: 'coffee', dateFrom: '2026-02-30' });
  expect(session.searching).toBe(false);
  expect(read).not.toHaveBeenCalled();
  await session.apply();
  expect(session.getSnapshot().invalid).toBe(true);
  expect(read).not.toHaveBeenCalled();
  session.fields({ keyword: 'coffee' });
  await session.apply();
  expect(read).toHaveBeenCalledOnce();
  expect(session.searching).toBe(true);
  expect(session.getSnapshot().search.filters).toEqual({ keyword: 'coffee' });
  session.fields({ keyword: 'unfinished' });
  expect(session.getSnapshot().search.data?.filters.keyword).toBe('coffee');
  expect(read).toHaveBeenCalledOnce();
});
it('detail/tab return retains applied criteria, unfinished fields, appended pages and scroll without rereading', async () => {
  const { registry, session, read } = setup();
  await session.apply({ keyword: 'coffee' });
  await session.more();
  session.fields({ keyword: 'not applied' });
  session.saveOffset(1840);
  session.reader.cancel();
  const returned = registry.get('trip');
  await returned.ensureSearch();
  expect(returned).toBe(session);
  expect(returned.offset).toBe(1840);
  expect(returned.getSnapshot().fields.keyword).toBe('not applied');
  expect(returned.getSnapshot().search.filters.keyword).toBe('coffee');
  expect(returned.getSnapshot().search.data?.items).toHaveLength(2);
  expect(read).toHaveBeenCalledTimes(2);
  expect(registry.get('other').searching).toBe(false);
});
it('each explicit unfiltered analysis opening reads a snapshot; closing/clearing returns to ordinary Query without a scan', async () => {
  const { session, read } = setup();
  await session.toggleAnalysis();
  expect(session.searching).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  await session.toggleAnalysis();
  expect(session.searching).toBe(false);
  // Ordinary Query may finish refreshing before analysis is opened again.
  session.invalidate();
  session.finishUpdate();
  read.mockResolvedValueOnce({
    ...page({ keyword: '' }),
    summary: { ...page({ keyword: '' }).summary, total: 99 },
  });
  await session.toggleAnalysis();
  expect(session.getSnapshot().search.data?.summary.total).toBe(99);
  expect(read).toHaveBeenCalledTimes(2);
  await session.apply({ keyword: 'coffee' });
  session.clear();
  expect(session.searching).toBe(false);
  expect(session.getSnapshot().analysis).toBe(false);
  expect(session.getSnapshot().search.data).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
});
it.each([undefined, 'deleted-expense'])(
  'confirmed refresh %s invalidates the same scope/trip search; refresh failure remains retryable and does not append old data',
  async (deleted) => {
    const { registry, session, read } = setup();
    const client = new QueryClient();
    const stop = registerExpenseBrowsers(client, 'env', 'account', registry);
    const otherTrip = registry.get('other');
    await session.apply({ keyword: 'coffee' });
    session.saveOffset(1200);
    await refreshTripData(client, 'other-env', 'account', 'trip');
    await refreshTripData(client, 'env', 'other-account', 'trip');
    expect(session.getSnapshot().dirty).toBe(false);
    await refreshTripData(client, 'env', 'account', 'trip', deleted);
    expect(session.getSnapshot().dirty).toBe(true);
    expect(otherTrip.getSnapshot().dirty).toBe(false);
    await session.more();
    expect(read).toHaveBeenCalledOnce();
    read.mockRejectedValueOnce(new ApiError('NETWORK'));
    await session.ensureSearch();
    expect(session.getSnapshot().dirty).toBe(true);
    expect(session.offset).toBe(1200);
    await session.refreshSearch();
    expect(read.mock.calls.at(-1)?.[0]).toEqual({ keyword: 'coffee' });
    expect(session.getSnapshot().dirty).toBe(false);
    expect(session.getSnapshot().updated).toBe(true);
    expect(session.offset).toBe(0);
    expect(session.getSnapshot().search.data?.items).toHaveLength(1);
    stop();
    await tick();
    client.clear();
  }
);
it('a write while rereading cancels the old read and cannot falsely clear the dirty flag', async () => {
  const { session, read } = setup();
  await session.apply({ keyword: 'coffee' });
  const pending = deferred<ExpenseSearchResult>();
  read.mockReturnValueOnce(pending.promise);
  const refreshing = session.refreshSearch();
  await tick();
  session.invalidate();
  pending.resolve(page({ keyword: 'coffee' }, 2));
  await refreshing;
  expect(session.getSnapshot().dirty).toBe(true);
  expect(session.getSnapshot().search.data?.items[0].id).toBe(
    page({ keyword: 'coffee' }).items[0].id
  );
  await session.ensureSearch();
  expect(session.getSnapshot().dirty).toBe(false);
});
it('blur cancels an in-flight initial search; focus retries it, while a finished result is retained', async () => {
  const { session, read } = setup();
  const pending = deferred<ExpenseSearchResult>();
  read.mockReturnValueOnce(pending.promise);
  const applying = session.apply({ keyword: 'coffee' });
  await tick();
  session.reader.cancel();
  pending.resolve(page({ keyword: 'coffee' }));
  await applying;
  expect(session.getSnapshot().search.data).toBeNull();
  expect(session.getSnapshot().search.error).toBeNull();
  await session.ensureSearch();
  expect(read).toHaveBeenCalledTimes(2);
  session.reader.cancel();
  await session.ensureSearch();
  expect(read).toHaveBeenCalledTimes(2);
});
it('409 stops append; explicit first-page refresh keeps criteria and full-summary coherence', async () => {
  const { session, read } = setup();
  await session.apply({ keyword: 'coffee' });
  read.mockResolvedValueOnce({ ...page({ keyword: 'coffee' }), revision: 'b'.repeat(64) });
  await session.more();
  expect(session.getSnapshot().search.restart).toBe(true);
  await session.more();
  expect(read).toHaveBeenCalledTimes(2);
  await session.refreshSearch();
  expect(session.getSnapshot().search.restart).toBe(false);
  expect(session.getSnapshot().search.data?.summary.count).toBe(48);
});
it('revocation purges private data/criteria/positions; reauthorization does not restore the old search', async () => {
  const { registry, session } = setup();
  await session.apply({ keyword: 'private' });
  session.saveOffset(300);
  registry.denyHidden(() => false);
  expect(session.searching).toBe(false);
  expect(session.offset).toBe(0);
  expect(session.getSnapshot().fields.keyword).toBe('');
  expect(session.getSnapshot().search.data).toBeNull();
  expect(registry.get('trip')).toBe(session);
});
it('disposal prevents late results and clears old login memory; a new scope starts at defaults', async () => {
  const { registry, session, read } = setup();
  await session.apply({ keyword: 'private' });
  const pending = deferred<ExpenseSearchResult>();
  read.mockReturnValueOnce(pending.promise);
  const refreshing = session.refreshSearch();
  await tick();
  registry.dispose();
  pending.resolve(page({ keyword: 'private' }));
  await refreshing;
  expect(session.getSnapshot().search.data).toBeNull();
  expect(session.getSnapshot().fields.keyword).toBe('');
  expect(setup().session.searching).toBe(false);
});
it('effect replay retains the session, but true provider removal clears and unregisters it', async () => {
  const { registry, session } = setup();
  const client = new QueryClient();
  const stop = registerExpenseBrowsers(client, 'env', 'account', registry);
  await session.apply({ keyword: 'coffee' });
  stop();
  const again = registerExpenseBrowsers(client, 'env', 'account', registry);
  await tick();
  expect(registry.get('trip')).toBe(session);
  expect(session.getSnapshot().search.data).not.toBeNull();
  again();
  await tick();
  expect(session.getSnapshot().search.data).toBeNull();
  await refreshTripData(client, 'env', 'account', 'trip');
  expect(session.getSnapshot().dirty).toBe(false);
});

it('foreground resumes only an unfinished or dirty focused search, never other trips or a completed snapshot', async () => {
  const { registry, session, read } = setup();
  await session.apply({ keyword: 'coffee' });
  session.focus();
  registry.resume();
  await tick();
  expect(read).toHaveBeenCalledOnce();
  const other = registry.get('other');
  await other.apply({ keyword: 'other' });
  other.invalidate();
  session.invalidate();
  registry.resume();
  await tick();
  expect(read).toHaveBeenCalledTimes(3);
  expect(other.getSnapshot().dirty).toBe(true);
  session.blur();
  session.invalidate();
  registry.resume();
  await tick();
  expect(read).toHaveBeenCalledTimes(3);
});
it('an ordinary refresh completing after another write cannot clear the newer invalidation', () => {
  const { session } = setup();
  session.invalidate();
  const finish = session.afterRead();
  session.invalidate();
  finish();
  expect(session.getSnapshot().dirty).toBe(true);
  session.afterRead()();
  expect(session.getSnapshot().dirty).toBe(false);
});
