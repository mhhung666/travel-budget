import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { ExpenseSearchReader, searchPath } from './search';
import type { ExpenseSearchResult } from '@travel-budget/contracts';
const revision = 'a'.repeat(64);
function page(n = 1, nextCursor: string | null = null): ExpenseSearchResult {
  return {
    filters: { keyword: '' },
    revision,
    ledger: { baseCurrency: 'USD', moneyScale: 2 },
    items: [
      {
        id: String(n).padStart(24, '0'),
        description: 'Meal',
        category: 'food',
        date: '2026-10-09',
        amount: 100,
        originalAmount: 100,
        currency: 'USD',
        payerId: null,
        payerName: '',
        ledger: { baseCurrency: 'USD', moneyScale: 2 },
      },
    ],
    nextCursor,
    payers: [],
    summary: { count: 45, total: 4500, mySpent: 1500, categories: [], members: [] },
  };
}
function setup() {
  const guard = vi.fn(async (): Promise<() => void> => () => {});
  const read = vi.fn(async (..._args: unknown[]) => page());
  const failure = vi.fn(async (_error: unknown) => {});
  return { reader: new ExpenseSearchReader({ guard, read, failure }), guard, read, failure };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function tick() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
describe('G4b private search reader', () => {
  it('encodes filters and resets cursors when applying a new search, preserving server totals', async () => {
    expect(
      searchPath('a/b', { keyword: ' Coffee & tea ', payerId: 'missing' }, `${revision}.20`)
    ).toBe(
      `/trips/a%2Fb/expense-search?keyword=Coffee+%26+tea&payerId=missing&cursor=${revision}.20`
    );
    const { reader, read } = setup();
    read.mockResolvedValueOnce(page(1, `${revision}.20`)).mockResolvedValueOnce(page(2));
    await reader.refresh();
    await reader.more();
    expect(reader.getSnapshot().data?.items).toHaveLength(2);
    expect(reader.getSnapshot().data?.summary.total).toBe(4500);
    read.mockResolvedValueOnce({ ...page(3), filters: { keyword: 'coffee' } });
    await reader.apply({ keyword: 'coffee' });
    expect(read.mock.calls.at(-1)?.[1]).toBeUndefined();
    expect(reader.getSnapshot().data?.items.map((e) => e.id)).toEqual([page(3).items[0].id]);
  });
  it('ignores a late old-filter response and aborts its request', async () => {
    const { reader, read } = setup();
    const old = deferred<ExpenseSearchResult>();
    read.mockReturnValueOnce(old.promise);
    const pending = reader.refresh();
    await tick();
    const signal = read.mock.calls[0][3] as AbortSignal;
    read.mockResolvedValueOnce({ ...page(3), filters: { keyword: 'new' } });
    await reader.apply({ keyword: 'new' });
    old.resolve(page(1));
    await pending;
    expect(signal.aborted).toBe(true);
    expect(reader.getSnapshot().data?.filters.keyword).toBe('new');
  });
  it('does not send a query superseded while awaiting SQLite', async () => {
    const { reader, read, guard } = setup();
    const wait = deferred<() => void>();
    guard.mockReturnValueOnce(wait.promise);
    const pending = reader.refresh();
    read.mockResolvedValueOnce({ ...page(), filters: { keyword: 'new' } });
    await reader.apply({ keyword: 'new' });
    wait.resolve(() => {});
    await pending;
    expect(read).toHaveBeenCalledOnce();
  });
  it('does not merge changed snapshots and requires a fresh first page after conflict', async () => {
    const { reader, read } = setup();
    read
      .mockResolvedValueOnce(page(1, `${revision}.20`))
      .mockResolvedValueOnce({ ...page(2), revision: 'b'.repeat(64) });
    await reader.refresh();
    await reader.more();
    expect(reader.getSnapshot().restart).toBe(true);
    expect(reader.getSnapshot().data?.items).toHaveLength(1);
    await reader.more();
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValueOnce(page(3));
    await reader.refresh();
    expect(reader.getSnapshot().restart).toBe(false);
    expect(read.mock.calls.at(-1)?.[1]).toBeUndefined();
  });
  it('preserves same-filter data after network failure and rejects malformed/mixed-unit responses', async () => {
    const { reader, read } = setup();
    await reader.refresh();
    read.mockRejectedValueOnce(new ApiError('NETWORK'));
    await reader.refresh();
    expect(reader.getSnapshot().data?.items).toHaveLength(1);
    const mixed = page();
    mixed.items[0].ledger.baseCurrency = 'TWD';
    read.mockResolvedValueOnce(mixed);
    await reader.apply({ keyword: '' });
    expect(reader.getSnapshot().data).toBeNull();
    expect(reader.getSnapshot().error).toBeTruthy();
  });
  it('calls the same guard on refresh replay, and checks it again after response', async () => {
    const { reader, read, guard } = setup();
    let allowed = true;
    guard.mockResolvedValue(() => {
      if (!allowed) throw new ApiError('CANCELLED');
    });
    read.mockImplementationOnce(async (_filters, _cursor, beforeSend) => {
      allowed = false;
      expect(() => (beforeSend as () => void)()).toThrow('CANCELLED');
      return page();
    });
    await reader.refresh();
    expect(reader.getSnapshot().data).toBeNull();
  });
  it('records even a late denial/429, cancels on blur, and prevents duplicate load-more', async () => {
    const { reader, read, failure } = setup();
    await reader.refresh();
    const wait = deferred<ExpenseSearchResult>();
    read.mockReturnValueOnce(wait.promise);
    const pending = reader.refresh();
    await tick();
    reader.cancel();
    wait.resolve(page(2));
    await pending;
    expect(reader.getSnapshot().data?.items[0].id).toBe(page(1).items[0].id);
    read.mockResolvedValueOnce(page(1, `${revision}.20`));
    await reader.refresh();
    const more = deferred<ExpenseSearchResult>();
    read.mockReturnValueOnce(more.promise);
    const loading = reader.more();
    await reader.more();
    await tick();
    more.resolve(page(2));
    await loading;
    expect(reader.getSnapshot().data?.items).toHaveLength(2);
    read.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
    await reader.refresh();
    expect(failure).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 429, retryAfter: 120 })
    );
  });
});
