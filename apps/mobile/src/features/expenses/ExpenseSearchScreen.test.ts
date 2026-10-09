import { beforeEach, expect, it, vi } from 'vitest';
import { ExpenseSearchScreen } from './ExpenseSearchScreen';
import { ApiError } from '@/api/client';
import type { ExpenseSearchResult } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
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
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('react-native', () => ({
  FlatList: 'FlatList',
  View: 'View',
  Keyboard: { dismiss: vi.fn() },
  AppState: { currentState: 'active' },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (fn: typeof h.focus) => {
    h.focus = fn;
  },
  router: { push: vi.fn() },
}));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/Disclosure', () => ({ Disclosure: 'Disclosure' }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('./ExpenseRow', () => ({ ExpenseRow: 'ExpenseRow' }));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Action', 'Card', 'Chip', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField'].map((n) => [
      n,
      n,
    ])
  ),
  styles: { page: {} },
}));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ money: (n: number) => `USD ${n}`, date: (d: string) => d }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => h.online } }));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: { environment: h.environment, accountId: 'a'.repeat(24) },
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
  return ExpenseSearchScreen({ tripId: 'b'.repeat(24) });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const n = node as { props: Props };
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
  await flush();
  return blur;
}
beforeEach(() => {
  vi.resetAllMocks();
  h.values = [];
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
  expect(find('expense-search-list').data).toHaveLength(1);
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
it('applying and clearing filters always begins at the first page; focus return refreshes applied criteria', async () => {
  const blur = await mount();
  find('search-keyword').onChangeText!('coffee');
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
  expect(h.request.mock.calls.at(-1)?.[1]).toBe('/trips/' + 'b'.repeat(24) + '/expense-search');
});
it('clears private results after denial, including later network failures', async () => {
  await mount();
  h.request.mockRejectedValueOnce(new ApiError('FORBIDDEN', 403));
  find('search-refresh').onPress!();
  await flush();
  expect(find('expense-search-list').data).toEqual([]);
  h.request.mockRejectedValueOnce(new ApiError('NETWORK'));
  find('search-refresh').onPress!();
  await flush();
  expect(find('expense-search-list').data).toEqual([]);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(false);
});
it('persists one shared 429 deadline; repeated local interception does not extend it', async () => {
  await mount();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  const before = Date.now();
  find('search-refresh').onPress!();
  await flush();
  expect(h.until).toBeGreaterThanOrEqual(before + 120000);
  const until = h.until;
  find('search-refresh').onPress!();
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
  find('search-refresh').onPress!();
  await flush();
  h.until = Date.now() + 120000;
  resume(h.until);
  await flush();
  expect(h.request).toHaveBeenCalledOnce();
  h.user = 'd'.repeat(24);
  h.version++;
  expect(find('expense-search-list').data).toEqual([]);
  expect(nodes(render()).some((n) => n.props.value === 'USD 3000')).toBe(false);
});
it('a failed 429 save prevents the next read until the original deadline can be persisted', async () => {
  await mount();
  h.pause.mockRejectedValue(new Error('disk failed'));
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  find('search-refresh').onPress!();
  await flush();
  find('search-refresh').onPress!();
  await flush();
  expect(h.request).toHaveBeenCalledTimes(2);
});
