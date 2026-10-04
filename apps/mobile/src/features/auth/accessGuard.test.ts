import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { keepAccessDenial, recordAccessDenial } from './accessGuard';
import { isAccessDenied } from './errorMessage';

type Mode = 'ok' | 'network' | 'timeout' | 'server';
const world = { mode: 'ok' as Mode };
const key: QueryKey = ['https://a.test/api/v1', 'u1', 'expense-options', 't1'];
const members = { members: ['Ann', 'Bob'] };
const read = async () => {
  if (world.mode === 'network') throw new ApiError('NETWORK');
  if (world.mode === 'timeout') throw new ApiError('TIMEOUT');
  if (world.mode === 'server') throw new ApiError('SERVER_ERROR', 503);
  return members;
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function screen(c: QueryClient) {
  const observer = new QueryObserver(c, {
    queryKey: key,
    queryFn: () => keepAccessDenial(c, key, read),
  });
  const stop = observer.subscribe(() => {});
  return { stop, refetch: () => observer.refetch(), read: () => observer.getCurrentResult() };
}
beforeEach(() => {
  world.mode = 'ok';
});

describe('an access denial found by another request', () => {
  it('becomes the query’s error, with the cached data left behind it to be hidden', async () => {
    const c = client();
    const view = screen(c);
    await view.refetch();
    expect(view.read().error).toBeNull();

    recordAccessDenial(c, key, new ApiError('NOT_FOUND', 404));
    expect(isAccessDenied(view.read().error)).toBe(true);
    expect(isAccessDenied(c.getQueryState(key)?.error)).toBe(true);
    expect(view.read().data).toEqual(members);
    view.stop();
  });

  it.each(['network', 'timeout', 'server'] as const)(
    'outlives a later %s failure, even after leaving and returning',
    async (failure) => {
      const c = client();
      const first = screen(c);
      await first.refetch();
      recordAccessDenial(c, key, new ApiError('FORBIDDEN', 403));

      world.mode = failure;
      await first.refetch();
      expect(isAccessDenied(first.read().error)).toBe(true);

      first.stop();
      const returned = screen(c);
      expect(isAccessDenied(returned.read().error)).toBe(true);
      await returned.refetch();
      expect(isAccessDenied(returned.read().error)).toBe(true);
      expect(isAccessDenied(c.getQueryState(key)?.error)).toBe(true);
      returned.stop();
    }
  );

  it('ends only when a read of the resource succeeds', async () => {
    const c = client();
    const view = screen(c);
    await view.refetch();
    recordAccessDenial(c, key, new ApiError('NOT_FOUND', 404));
    world.mode = 'network';
    await view.refetch();
    world.mode = 'ok';
    await view.refetch();
    expect(view.read().error).toBeNull();
    expect(view.read().data).toEqual(members);
    view.stop();
  });

  it.each([
    ['a network failure', new ApiError('NETWORK')],
    ['a server error', new ApiError('SERVER_ERROR', 503)],
    ['a bad request', new ApiError('VALIDATION_ERROR', 400)],
    ['an error that is not the API’s', new Error('404')],
    ['nothing', undefined],
  ])('is not recorded for %s', async (_name, error) => {
    const c = client();
    const view = screen(c);
    await view.refetch();
    recordAccessDenial(c, key, error);
    expect(view.read().error).toBeNull();
    expect(view.read().data).toEqual(members);
    view.stop();
  });

  it('does nothing for a resource that was never read', () => {
    const c = client();
    expect(() => recordAccessDenial(c, key, new ApiError('NOT_FOUND', 404))).not.toThrow();
    expect(c.getQueryState(key)).toBeUndefined();
  });

  it('does not touch the same resource of another trip or account', async () => {
    const c = client();
    const otherTrip = [...key.slice(0, 3), 't2'];
    const otherAccount = [key[0], 'u2', ...key.slice(2)];
    for (const queryKey of [key, otherTrip, otherAccount]) c.setQueryData(queryKey, members);
    recordAccessDenial(c, key, new ApiError('NOT_FOUND', 404));
    expect(isAccessDenied(c.getQueryState(key)?.error)).toBe(true);
    expect(c.getQueryState(otherTrip)?.error).toBeNull();
    expect(c.getQueryState(otherAccount)?.error).toBeNull();
  });
});
