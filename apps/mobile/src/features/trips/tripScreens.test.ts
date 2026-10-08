import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { messages } from '@/i18n/messages';
import { colors } from '@/theme/tokens';
import { formatDate, money } from '@/i18n/format';
import type { Trip } from '@/api/contracts';
import { TripsScreen } from './TripsScreen';
import { TripScreen, TripSupplement } from './TripScreen';
import { TripCard } from './TripCard';
import { TripFinancialSummary, tripDates } from './TripSummary';
import { LocalWorkLink } from './LocalWorkLink';

const h = vi.hoisted(() => ({
  locale: 'en' as keyof typeof messages,
  dark: false,
  fontScale: 1,
  width: 390,
  measuredWidth: 0,
  expanded: false,
  online: true,
  user: { id: 'account' } as { id: string } | null,
  deniedIds: [] as string[],
  push: vi.fn(),
  visible: vi.fn(),
  list: {
    data: undefined as { pages: { items: Trip[] }[] } | undefined,
    error: undefined as unknown,
    isPending: false,
    isError: false,
    isRefetching: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
  trip: {
    data: undefined as
      | (Trip & {
          role: 'admin' | 'member';
          expenseCount: number;
          budgetTotal: number | null;
          todayGroupSpent: number;
        })
      | undefined,
    error: undefined as unknown,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  queue: {
    data: [] as { status: string; environment: string; accountId: string; tripId: string | null }[],
    isPending: false,
    isError: false,
  },
  operations: {
    data: [] as { status: string; environment: string; accountId: string; tripId: string | null }[],
    isPending: false,
    isError: false,
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) =>
    typeof initial === 'number'
      ? [
          h.measuredWidth,
          (value: number) => {
            h.measuredWidth = value;
          },
        ]
      : [
          h.expanded,
          (value: (old: boolean) => boolean) => {
            h.expanded = value(h.expanded);
          },
        ],
}));
vi.mock('react-native', () => ({
  ...Object.fromEntries(
    ['Text', 'View', 'Pressable', 'FlatList', 'RefreshControl', 'ActivityIndicator'].map((name) => [
      name,
      name,
    ])
  ),
  useWindowDimensions: () => ({ width: h.width, fontScale: h.fontScale }),
}));
vi.mock('expo-router', () => ({ router: { push: h.push } }));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/ui', async () => {
  const { colors } = await import('@/theme/tokens');
  return {
    ...Object.fromEntries(
      [
        'Action',
        'Badge',
        'Card',
        'Copy',
        'DetailRow',
        'Metric',
        'Notice',
        'Page',
        'Section',
        'Title',
      ].map((name) => [name, name])
    ),
    styles: { page: {} },
    usePalette: () => colors[h.dark ? 'dark' : 'light'],
  };
});
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    user: h.user,
    manager: { api: { baseUrl: 'https://test/api/v1' } },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: h.visible } }),
}));
vi.mock('@/features/auth/errorMessage', () => ({
  isAccessDenied: (error: unknown) => error === 'denied',
  errorMessage: () => 'Failure',
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('./queries', () => ({ useTrips: () => h.list, useTrip: () => h.trip }));
vi.mock('@/features/expenses/entryProvider', () => ({
  useExpenseQueue: () => ({ records: h.queue }),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({ records: h.operations }),
}));

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function find(node: ReactNode, key: string, value: unknown) {
  const element = nodes(node).find((n) => n.props[key] === value);
  if (!element) throw new Error(`Missing ${key}=${String(value)}`);
  return element;
}
function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (isValidElement(node)) return content((node as Element).props.children as ReactNode);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function press(element: Element) {
  (element.props.onPress as () => void)();
}
function list() {
  return find(TripsScreen(), 'testID', 'trips-list');
}
const trip: Trip = {
  id: 'a',
  name: 'TEST '.repeat(30),
  archived: false,
  phase: 'ongoing',
  description: 'Private note',
  destination: 'TEST city',
  startDate: '2026-10-08',
  endDate: '2026-10-11',
  memberCount: 3,
  mySpent: 43.3,
  myBalance: -0.01,
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h, {
    locale: 'en',
    dark: false,
    fontScale: 1,
    width: 390,
    measuredWidth: 0,
    expanded: false,
    online: true,
    user: { id: 'account' },
    deniedIds: [],
  });
  h.visible.mockImplementation((_scope, id) => !h.deniedIds.includes(id));
  Object.assign(h.list, {
    data: { pages: [{ items: [trip] }] },
    error: undefined,
    isError: false,
    isPending: false,
    isRefetching: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  Object.assign(h.trip, {
    data: { ...trip, role: 'member', expenseCount: 0, budgetTotal: null, todayGroupSpent: 0 },
    error: undefined,
    isError: false,
    isPending: false,
    isFetching: false,
  });
  Object.assign(h.queue, { data: [], isPending: false, isError: false });
  Object.assign(h.operations, { data: [], isPending: false, isError: false });
});

it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'keeps incomplete date-only values explicit in %s',
  (locale) => {
    const t = messages[locale];
    expect(tripDates({ startDate: null, endDate: null }, t)).toBe(t.unscheduled);
    expect(tripDates(trip, t, locale)).toBe(
      `${formatDate(trip.startDate!, locale)} — ${formatDate(trip.endDate!, locale)}`
    );
    expect(tripDates({ startDate: null, endDate: trip.endDate }, t, locale)).toBe(
      `${t.startDate}: ${t.notSet} · ${t.endDate}: ${formatDate(trip.endDate!, locale)}`
    );
    expect(tripDates({ startDate: trip.startDate, endDate: null }, t)).toContain(
      `${t.endDate}: ${t.notSet}`
    );
  }
);
it.each([
  [36.21, 'receivable'],
  [-0.01, 'payable'],
  [0, 'balanced'],
] as const)('shows the backend balance %s with its direction', (balance, label) => {
  const tree = TripFinancialSummary({ trip: { ...trip, myBalance: balance } });
  expect(find(tree, 'testID', 'trip-balance').props).toMatchObject({
    label: messages.en[label],
    value: money(Math.abs(balance)),
  });
  expect(find(tree, 'testID', 'trip-my-spent').props.value).toBe(money(43.3));
});
it('uses measured container width, including card padding and the page cap', () => {
  h.width = 1200;
  h.measuredWidth = 0;
  const tree = TripFinancialSummary({ trip });
  expect(tree.props.style.flexDirection).toBe('column');
  (tree.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 310 } } });
  expect(TripFinancialSummary({ trip }).props.style.flexDirection).toBe('column');
  (tree.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 600 } } });
  expect(TripFinancialSummary({ trip }).props.style.flexDirection).toBe('row');
  h.fontScale = 2;
  expect(TripFinancialSummary({ trip }).props.style.flexDirection).toBe('column');
});
it('keeps long archived names and truthful accounting in the accessible card, in both palettes', () => {
  for (const dark of [false, true]) {
    h.dark = dark;
    const tree = TripCard({ trip: { ...trip, archived: true, myBalance: 0 } });
    expect(tree.props.accessibilityLabel).toContain(trip.name);
    expect(tree.props.accessibilityLabel).toContain(messages.en.archived);
    expect(tree.props.accessibilityLabel).toContain(messages.en.balanced);
    expect(nodes(tree).some((n) => n.props.numberOfLines !== undefined)).toBe(false);
    expect(
      (tree.props.style as (p: { pressed: boolean }) => object)({ pressed: false })
    ).toMatchObject({ backgroundColor: colors[dark ? 'dark' : 'light'].surface });
    press(tree);
  }
  expect(h.push).toHaveBeenLastCalledWith({ pathname: '/trips/[id]', params: { id: 'a' } });
});
it('deduplicates paged trips while preserving refresh and load-more callbacks', () => {
  h.list.data!.pages.push({ items: [trip, { ...trip, id: 'b' }] });
  h.list.hasNextPage = true;
  const tree = list();
  expect((tree.props.data as Trip[]).map((t) => t.id)).toEqual(['a', 'b']);
  ((tree.props.refreshControl as Element).props.onRefresh as () => void)();
  press(tree.props.ListFooterComponent as Element);
  expect(h.list.refetch).toHaveBeenCalledOnce();
  expect(h.list.fetchNextPage).toHaveBeenCalledOnce();
});
it.each(['catalog', 'http', 'no-account'])(
  'hides cached names and figures after %s denial',
  (source) => {
    if (source === 'catalog') h.deniedIds = ['a'];
    if (source === 'http') {
      h.trip.error = h.list.error = 'denied';
      h.trip.isError = h.list.isError = true;
    }
    if (source === 'no-account') h.user = null;
    expect(list().props.data).toEqual([]);
    const overview = TripScreen({ id: 'a' });
    expect(content(overview)).not.toContain(trip.name);
    expect(nodes(overview).some((n) => n.props.testID === 'trip-add-expense')).toBe(false);
  }
);
it('retains authorized stale cards with a retry, but does not render an empty success after failure', () => {
  h.list.isError = true;
  h.list.error = 'network';
  expect(list().props.data).toHaveLength(1);
  expect(content(list().props.ListHeaderComponent as ReactNode)).toContain(messages.en.staleData);
  h.list.data = undefined;
  expect(list().props.ListEmptyComponent).toBeNull();
});
it('keeps an offline local entry and disables online create, join, and pagination', () => {
  h.online = false;
  h.list.hasNextPage = true;
  const tree = list();
  for (const id of ['create-trip', 'join-trip'])
    expect(find(tree.props.ListHeaderComponent as ReactNode, 'testID', id).props.disabled).toBe(
      true
    );
  expect((tree.props.ListFooterComponent as Element).props.disabled).toBe(true);
  press(find(LocalWorkLink(), 'testID', 'local-work'));
  expect(h.push).toHaveBeenCalledWith('/work');
});
it('places personal finances before add and metadata, with unset budget distinct from zero', () => {
  const tree = TripScreen({ id: 'a' });
  const all = nodes(tree);
  expect(all.findIndex((n) => n.type === TripFinancialSummary)).toBeLessThan(
    all.findIndex((n) => n.props.testID === 'trip-add-expense')
  );
  expect(all.findIndex((n) => n.props.testID === 'trip-add-expense')).toBeLessThan(
    all.findIndex((n) => n.props.testID === 'trip-budget')
  );
  expect(find(tree, 'testID', 'trip-budget').props.value).toBe(messages.en.notSet);
  h.trip.data!.budgetTotal = 0;
  expect(find(TripScreen({ id: 'a' }), 'testID', 'trip-budget').props.value).toBe(money(0));
  press(find(tree, 'testID', 'trip-add-expense'));
  expect(h.push).toHaveBeenCalledWith({
    pathname: '/trips/[id]/expenses/new',
    params: { id: 'a' },
  });
});
it('offers loading and error/retry without fabricated overview metrics', () => {
  h.trip.data = undefined;
  h.trip.isPending = true;
  expect(nodes(TripScreen({ id: 'a' })).some((n) => n.type === 'ActivityIndicator')).toBe(true);
  h.trip.isPending = false;
  h.trip.isError = true;
  const tree = TripScreen({ id: 'a' });
  expect(nodes(tree).some((n) => n.props.testID === 'trip-budget')).toBe(false);
  press(find(tree, 'label', messages.en.retry));
  expect(h.trip.refetch).toHaveBeenCalledOnce();
});
it('makes long supplement text reachable through an expanded disclosure', () => {
  const props = { destination: 'TEST city', description: 'Private note '.repeat(100) };
  expect(content(TripSupplement(props))).not.toContain(props.description);
  press(find(TripSupplement(props), 'testID', 'trip-supplement'));
  expect(find(TripSupplement(props), 'testID', 'trip-supplement').props.accessibilityState).toEqual(
    { expanded: true }
  );
  expect(content(TripSupplement(props))).toContain(props.description);
});
it('counts only unresolved queue and pending E operations without exposing payloads', () => {
  const scope = { environment: 'https://test/api/v1', accountId: 'account', tripId: 'trip' };
  h.queue.data = [
    { ...scope, status: 'resolved' },
    { ...scope, status: 'queued' },
  ];
  h.operations.data = [
    { ...scope, status: 'pending' },
    { ...scope, status: 'completed' },
  ];
  expect(content(LocalWorkLink())).toContain(`${messages.en.queueTitle}: 1`);
  expect(content(LocalWorkLink())).toContain(`${messages.en.pendingOperations}: 1`);
});
it.each(['queue', 'operations'] as const)(
  'does not turn %s failure into zero, and retains the local link',
  (source) => {
    h[source].isError = true;
    const tree = LocalWorkLink();
    expect(content(tree)).toContain(messages.en.localStatusUnavailable);
    expect(content(tree)).not.toContain(': 0');
    expect(find(tree, 'testID', 'local-work')).toBeDefined();
  }
);
it('does not turn local loading into zero', () => {
  h.queue.isPending = true;
  expect(content(LocalWorkLink())).toContain(messages.en.loading);
  expect(content(LocalWorkLink())).not.toContain(': 0');
});

it('counts the same visible scopes and trip results as the recovery lists', () => {
  const scope = { environment: 'https://test/api/v1', accountId: 'account', tripId: 'trip' };
  h.deniedIds = ['hidden'];
  h.queue.data = [
    { ...scope, status: 'queued' },
    { ...scope, status: 'attention', tripId: 'hidden' },
    { ...scope, status: 'prepared', accountId: 'other' },
    { ...scope, status: 'queued', environment: 'https://other/api/v1' },
    { ...scope, status: 'resolved' },
  ];
  h.operations.data = [
    { ...scope, status: 'pending' },
    { ...scope, status: 'pending', tripId: 'hidden' },
    { ...scope, status: 'pending', accountId: 'other' },
    { ...scope, status: 'pending', environment: 'https://other/api/v1' },
    { ...scope, status: 'completed' },
  ];
  expect(content(LocalWorkLink())).toContain(`${messages.en.queueTitle}: 1`);
  expect(content(LocalWorkLink())).toContain(`${messages.en.pendingOperations}: 1`);
  h.deniedIds = ['trip', 'hidden'];
  expect(content(LocalWorkLink())).toContain(`${messages.en.queueTitle}: 0`);
  expect(content(LocalWorkLink())).toContain(`${messages.en.pendingOperations}: 0`);
  h.user = { id: 'other' };
  h.deniedIds = [];
  expect(content(LocalWorkLink())).toContain(`${messages.en.queueTitle}: 1`);
  expect(content(LocalWorkLink())).toContain(`${messages.en.pendingOperations}: 1`);
  h.queue.isError = true;
  expect(content(LocalWorkLink())).toContain(messages.en.localStatusUnavailable);
  expect(content(LocalWorkLink())).not.toContain(': 0');
});
