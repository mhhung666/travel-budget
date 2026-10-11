import { beforeEach, expect, it, vi } from 'vitest';
import { ExpenseListItem } from './ExpenseListItem';
import type { ExpenseRowProps } from './ExpenseRow';
import { ExpensesScreen } from './ExpensesScreen';
import { ExpenseSearchControls } from './ExpenseSearchControls';
import { createExpenseBrowseRegistry } from './browseProvider';
import type { ExpenseBrowseSession } from './browse';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { ApiError } from '@/api/client';
import type { ExpenseSearchResult } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  session: null as ExpenseBrowseSession | null,
  values: [] as unknown[],
  i: 0,
  focus: (() => () => {}) as () => () => void,
  request: vi.fn(),
  pause: vi.fn(),
  retryAt: vi.fn(),
  online: true,
  visible: true,
  version: 1,
  access: 1,
  until: 0,
  user: 'a'.repeat(24),
  environment: 'https://test/api/v1',
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.values[i],
      (v: unknown) => {
        h.values[i] = typeof v === 'function' ? v(h.values[i]) : v;
      },
    ];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useRef: () => ({ current: null }),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('react-native', () => ({
  FlatList: 'FlatList',
  ActivityIndicator: 'ActivityIndicator',
  RefreshControl: 'RefreshControl',
  View: 'View',
  Keyboard: { dismiss: vi.fn() },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (fn: typeof h.focus) => {
    h.focus = fn;
  },
  router: { push: vi.fn(), dismissTo: vi.fn() },
}));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/Disclosure', () => ({ Disclosure: 'Disclosure' }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('./ExpenseRow', () => ({ ExpenseRow: 'ExpenseRow' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Action', 'Card', 'Chip', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField', 'Title'].map(
      (n) => [n, n]
    )
  ),
  styles: { page: {} },
  usePalette: () => ({ primary: 'blue' }),
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ money: (n: number) => `USD ${n}`, date: (d: string) => d }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => h.online } }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: { id: h.user },
    manager: {
      api: { environment: h.environment },
      getSignInVersion: () => h.version,
      getSnapshot: () => ({ status: 'signedIn', user: { id: h.user } }),
      requestAs: h.request,
    },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      isVisible: () => h.visible,
      captureAccess: () => {
        const access = h.access;
        return () => {
          if (access !== h.access) throw new ApiError('CANCELLED');
        };
      },
      deny: async () => {
        h.access++;
        h.visible = false;
      },
    },
  }),
}));
vi.mock('./browseProvider', async (original) => ({
  ...(await original<typeof import('./browseProvider')>()),
  useExpenseBrowse: () => ({ session: h.session!, state: h.session!.getSnapshot() }),
}));
vi.mock('./queries', () => ({
  useExpenses: () => ({
    query: { data: { pages: [] }, isError: false, refetch: vi.fn(), isFetching: false },
    refresh: vi.fn(),
    cancel: vi.fn(),
  }),
}));
vi.mock('./entryProvider', () => ({ usePendingExpenses: () => ({ data: [] }) }));
vi.mock('./useTripMembers', () => ({
  useTripMembers: () => ({
    roster: [
      { id: 'a'.repeat(24), displayName: 'Same name' },
      { id: 'd'.repeat(24), displayName: 'Same name', isVirtual: true },
    ],
    denied: false,
    refresh: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: h.retryAt,
    rateLimitUntil: () => h.until,
    pause: h.pause,
  }),
}));
const result: ExpenseSearchResult = {
  ledger: { baseCurrency: 'USD', moneyScale: 2 },
  revision: 'a'.repeat(64),
  filters: { keyword: '' },
  nextCursor: 'a'.repeat(64) + '.20',
  items: [
    {
      ledger: { baseCurrency: 'USD', moneyScale: 2 },
      id: 'c'.repeat(24),
      date: '2026-10-09',
      description: 'Private meal',
      category: 'food',
      payerId: 'a'.repeat(24),
      payerName: 'Same name',
      amount: 100,
      originalAmount: 100,
      currency: 'USD',
    },
  ],
  payers: [
    { userId: 'a'.repeat(24), displayName: 'Same name' },
    { userId: 'd'.repeat(24), displayName: 'Same name', isVirtual: true },
  ],
  summary: {
    count: 30,
    total: 3000,
    mySpent: 1000,
    categories: [{ category: 'food', count: 30, total: 3000 }],
    members: [],
  },
};
function refresh() {
  const control = find('expenses-list') as {
    refreshControl?: { props: { onRefresh: () => void } };
  };
  control.refreshControl!.props.onRefresh();
}
interface Props {
  testID?: string;
  children?: unknown;
  ListHeaderComponent?: unknown;
  ListFooterComponent?: unknown;
  data?: unknown[];
  value?: string;
  disabled?: boolean;
  label?: string;
  onPress?: () => void;
  onChangeText?: (v: string) => void;
}
function render() {
  h.i = 0;
  return ExpensesScreen({ tripId: 'b'.repeat(24) });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const n = node as { type?: unknown; props: Props };
  if (n.type === ExpenseSearchControls)
    return nodes(
      ExpenseSearchControls(n.props as unknown as Parameters<typeof ExpenseSearchControls>[0])
    );
  return [
    n,
    ...nodes(n.props.children),
    ...nodes(n.props.ListHeaderComponent),
    ...nodes(n.props.ListFooterComponent),
  ];
}
function find(id: string) {
  const n = nodes(render()).find((n) => n.props.testID === id);
  if (!n) throw new Error(`Missing ${id}`);
  return n.props;
}
async function flush() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}
async function mount() {
  render();
  const blur = h.focus();
  find('search-analysis').onPress!();
  h.session!.tools();
  await flush();
  return blur;
}
beforeEach(() => {
  vi.resetAllMocks();
  h.values = [];
  h.session = createExpenseBrowseRegistry(
    useAuth().manager,
    useDraftCatalog().catalog,
    h.environment,
    'a'.repeat(24),
    1
  ).get('b'.repeat(24));
  h.i = 0;
  h.visible = h.online = true;
  h.user = 'a'.repeat(24);
  h.version = h.access = 1;
  h.until = 0;
  h.retryAt.mockImplementation(async () => h.until);
  h.pause.mockImplementation(async (_scope, until: number) => {
    h.until = Math.max(h.until, until);
  });
  h.request.mockImplementation(async (_actor, path: string, _schema, options) => {
    options.beforeSend();
    return {
      ...result,
      filters: { keyword: new URL('https://test' + path).searchParams.get('keyword') ?? '' },
    };
  });
});
it('shows full totals, stable same-name payer choices and validates dates before any new request', async () => {
  await mount();
  expect(find('expenses-list').data).toHaveLength(1);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(true);
  expect(find('search-payer-' + 'a'.repeat(24)).label).not.toBe(
    find('search-payer-' + 'd'.repeat(24)).label
  );
  find('search-date-from').onChangeText!('2026-02-30');
  find('search-apply').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledOnce();
  expect(nodes(render()).some((n) => n.props.children === 'searchInvalid')).toBe(true);
});
it('typing is idle, applied filters start at page one, and focus return retains criteria without a read', async () => {
  const blur = await mount();
  find('search-keyword').onChangeText!('coffee');
  expect(h.request).toHaveBeenCalledOnce();
  find('search-apply').onPress!();
  await flush();
  expect(h.request.mock.calls.at(-1)?.[1]).toContain('?keyword=coffee');
  blur();
  render();
  h.focus();
  await flush();
  expect(h.request.mock.calls.at(-1)?.[1]).toContain('?keyword=coffee');
  find('search-reset').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(h.session!.searching).toBe(false);
  expect(h.session!.getSnapshot().search.data).toBeNull();
});
it('clears private results after denial, including later network failures', async () => {
  await mount();
  h.request.mockRejectedValueOnce(new ApiError('FORBIDDEN', 403));
  refresh();
  await flush();
  expect(find('expenses-list').data).toEqual([]);
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  refresh();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(find('expenses-list').data).toEqual([]);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(false);
});
it('persists one shared 429 deadline; repeated local interception does not extend it', async () => {
  await mount();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  const before = Date.now();
  refresh();
  await flush();
  expect(h.until).toBeGreaterThanOrEqual(before + 120000);
  const until = h.until;
  refresh();
  await flush();
  expect(h.until).toBe(until);
  expect(h.request).toHaveBeenCalledTimes(2);
});
it('a new cross-trip limit while SQLite waits blocks the search; account change hides existing results', async () => {
  await mount();
  let resume!: (v: number) => void;
  h.retryAt.mockReturnValueOnce(
    new Promise<number>((r) => {
      resume = r;
    })
  );
  refresh();
  await flush();
  h.until = Date.now() + 120000;
  resume(h.until);
  await flush();
  expect(h.request).toHaveBeenCalledOnce();
  h.user = 'd'.repeat(24);
  h.version++;
  h.session = createExpenseBrowseRegistry(
    useAuth().manager,
    useDraftCatalog().catalog,
    h.environment,
    h.user,
    h.version
  ).get('b'.repeat(24));
  expect(find('expenses-list').data).toEqual([]);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(false);
});
it('a failed 429 save prevents the next read until the original deadline can be persisted', async () => {
  await mount();
  h.pause.mockRejectedValue(new Error('disk failed'));
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  refresh();
  await flush();
  refresh();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
});

it('uses the shared date rows across appended search pages, deduplicating IDs without changing full totals', async () => {
  const first = result.items[0];
  const second = { ...first, id: 'e'.repeat(24) };
  const third = { ...first, id: 'f'.repeat(24), date: '2026-10-08' };
  h.request.mockImplementation(async (_actor, path: string, _schema, options) => {
    options.beforeSend();
    return path.includes('cursor=')
      ? { ...result, items: [first, second, third], nextCursor: null }
      : result;
  });
  await mount();
  find('expenses-load-more').onPress!();
  await flush();
  const list = find('expenses-list') as {
    data: typeof result.items;
    renderItem: (input: { item: typeof first; index: number }) => {
      type: unknown;
      props: ExpenseRowProps;
    };
  };
  expect(list.data.map((e) => e.id)).toEqual([first.id, second.id, third.id]);
  const rows = list.data.map((item, index) => list.renderItem({ item, index }));
  expect(rows.every((e) => e.type === ExpenseListItem)).toBe(true);
  expect(rows.map((e) => [e.props.startOfDay, e.props.endOfDay])).toEqual([
    [true, false],
    [false, true],
    [true, true],
  ]);
  expect(rows.every((e) => e.props.tripId === 'b'.repeat(24))).toBe(true);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(true);
  expect(h.request).toHaveBeenCalledTimes(2);
});

it('offline pull-to-refresh preserves loaded search pages and summary without a request', async () => {
  await mount();
  const previous = find('expenses-list').data;
  h.online = false;
  refresh();
  await flush();
  expect(h.request).toHaveBeenCalledOnce();
  expect(find('expenses-list').data).toEqual(previous);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(true);
});
it('returning after a confirmed write rereads original criteria once and announces the updated first page', async () => {
  const blur = await mount();
  find('search-keyword').onChangeText!('coffee');
  find('search-apply').onPress!();
  await flush();
  h.session!.saveOffset(1200);
  blur();
  h.session!.invalidate();
  render();
  h.focus();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(3);
  expect(h.request.mock.calls.at(-1)?.[1]).toContain('?keyword=coffee');
  expect(h.request.mock.calls.at(-1)?.[1]).not.toContain('cursor=');
  expect(h.session!.offset).toBe(0);
  expect(nodes(render()).some((n) => n.props.children === 'expensesUpdated')).toBe(true);
  render();
  h.focus();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(3);
});
it('has one main access-denied notice and does not expose another list or summary', async () => {
  await mount();
  h.visible = false;
  const tree = nodes(render());
  expect(tree.filter((n) => n.props.children === 'notFound')).toHaveLength(1);
  expect(find('expenses-list').data).toEqual([]);
  expect(tree.some((n) => n.props.value === 'USD 3000')).toBe(false);
});
