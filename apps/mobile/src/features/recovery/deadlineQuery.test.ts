import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { recoveryDeadlineOptions, useRecoveryDeadline } from './useRecoveryDeadline';

const h = vi.hoisted(() => ({
  read: vi.fn(),
  observer: null as ReturnType<typeof mount> | null,
  refs: new Map<number, { current: unknown }>(),
  page: 0,
  effects: [] as (() => void)[],
}));
// The hook effects run against actual QueryObserver results/refetches; no query result stubs.
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => h.observer!.getCurrentResult(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef: (initial: unknown) => {
    if (!h.refs.has(h.page)) h.refs.set(h.page, { current: initial });
    return h.refs.get(h.page);
  },
  useEffect: (effect: () => void) => h.effects.push(effect),
}));
vi.mock('./useRecoveryClock', () => ({ useRecoveryClock: () => Date.now() }));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({ retryAt: h.read }),
}));
const scope = { environment: 'https://test/api/v1', accountId: 'account' };
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  h.refs.clear();
  h.effects = [];
  h.read.mockReset();
});
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function mount(client: QueryClient, nextScope = scope) {
  const observer = new QueryObserver(client, recoveryDeadlineOptions(nextScope));
  cleanups.push(observer.subscribe(() => undefined));
  return observer;
}
it.each([false, true])('measures the old mount refetch with warm cache=%s', async (warm) => {
  const client = new QueryClient();
  cleanups.push(() => client.clear());
  let resolve!: (value: number) => void;
  h.read.mockImplementation(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      })
  );
  if (warm) client.setQueryData(recoveryDeadlineOptions(scope).queryKey, 10);
  const observer = mount(client);
  await flush();
  expect(h.read).toHaveBeenCalledTimes(1);
  void observer.refetch(); // The existing hook's initial effect.
  await flush();
  expect(h.read).toHaveBeenCalledTimes(warm ? 2 : 1);
  resolve(120000);
  await flush();
  expect(observer.getCurrentResult().data).toBe(120000);
});

function DeadlineHarness(
  observer: ReturnType<typeof mount>,
  page: number,
  revision: number,
  nextScope = scope
) {
  h.observer = observer;
  h.page = page;
  const result = useRecoveryDeadline(nextScope, revision);
  h.effects.splice(0).forEach((effect) => effect());
  return result;
}
it.each([false, true])(
  'reads once on mount with warm cache=%s and rereads a new 429 revision',
  async (warm) => {
    const client = new QueryClient();
    cleanups.push(() => client.clear());
    const original = Date.now() + 120000;
    let resolve!: (value: number) => void;
    h.read.mockImplementation(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        })
    );
    if (warm) client.setQueryData(recoveryDeadlineOptions(scope).queryKey, original);
    const observer = mount(client);
    DeadlineHarness(observer, 1, 1);
    await flush();
    expect(h.read).toHaveBeenCalledTimes(1);
    resolve(original);
    await flush();
    expect(DeadlineHarness(observer, 1, 1).until).toBe(original);
    expect(h.read).toHaveBeenCalledTimes(1);
    DeadlineHarness(observer, 1, 2);
    await flush();
    expect(h.read).toHaveBeenCalledTimes(2);
    resolve(original + 120000);
    await flush();
    expect(DeadlineHarness(observer, 1, 2).until).toBe(original + 120000);
  }
);
it('shares an in-flight read between pages of the same scope and isolates account/environment switches', async () => {
  const client = new QueryClient();
  cleanups.push(() => client.clear());
  let resolve!: (value: number) => void;
  h.read.mockImplementation(
    () =>
      new Promise<number>((done) => {
        resolve = done;
      })
  );
  client.setQueryData(recoveryDeadlineOptions(scope).queryKey, Date.now() + 120000);
  const first = mount(client);
  DeadlineHarness(first, 1, 1);
  const second = mount(client);
  DeadlineHarness(second, 2, 1);
  await flush();
  expect(h.read).toHaveBeenCalledTimes(1);
  resolve(Date.now() + 120000);
  await flush();
  const another = { ...scope, accountId: 'other' };
  first.setOptions(recoveryDeadlineOptions(another));
  expect(DeadlineHarness(first, 1, 1, another).until).toBe(0);
  await flush();
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.read).toHaveBeenLastCalledWith(another);
  resolve(0);
  await flush();
  const environment = { ...another, environment: 'https://other/api/v1' };
  first.setOptions(recoveryDeadlineOptions(environment));
  DeadlineHarness(first, 1, 1, environment);
  await flush();
  expect(h.read).toHaveBeenCalledTimes(3);
  expect(h.read).toHaveBeenLastCalledWith(environment);
  resolve(0);
  await flush();
});
