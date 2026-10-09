import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import AppLayout from '@/app/(app)/_layout';
import { MyScreen } from './MyScreen';
import { SelectTripScreen } from './SelectTripScreen';
import { LocalWorkScreen } from './LocalWorkScreen';
import { TripContext } from './TripContext';
import { GlobalTabBar, TripLayout } from './layouts';
import { FormPage } from '@/components/screen';
import { TabRouter } from 'expo-router/build/react-navigation/routers';

vi.mock('@/features/expenses/PendingReceipts', () => ({ PendingReceipts: 'PendingReceipts' }));
const h = vi.hoisted(() => ({
  status: 'signedIn',
  online: true,
  pathname: '/trips',
  tripId: 'a',
  visible: true,
  state: [] as unknown[],
  refs: [] as { current: unknown }[],
  deps: [] as unknown[][],
  i: 0,
  j: 0,
  k: 0,
  logout: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  remote: {
    data: {
      pages: [
        {
          items: [
            { id: 'a', name: 'Trip A' },
            { id: 'b', name: 'Trip B' },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  local: {
    data: [
      { tripId: 'a', name: 'Local A', options: {} as object | undefined },
      { tripId: 'b', name: 'Local B', options: undefined },
    ],
    scope: { environment: 'https://example/api/v1', accountId: 'account' },
    isPending: false,
    isError: false,
    storageFailed: false,
    refetch: vi.fn(),
  },
  trip: { data: { name: 'Private trip' }, error: undefined as unknown },
  queue: {
    data: [] as { status: string; environment?: string; accountId?: string; tripId?: string }[],
    isPending: false,
    isError: false,
  },
  operations: {
    data: [] as { status: string; environment?: string; accountId?: string; tripId?: string }[],
    isPending: false,
    isError: false,
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.state)) h.state[i] = initial;
    return [
      h.state[i],
      (value: unknown) => {
        h.state[i] = value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (effect: () => void, deps: unknown[]) => {
    const i = h.k++;
    if (!h.deps[i] || deps.some((value, index) => !Object.is(value, h.deps[i][index]))) effect();
    h.deps[i] = deps;
  },
}));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  FlatList: 'FlatList',
  ActivityIndicator: 'ActivityIndicator',
  RefreshControl: 'RefreshControl',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  return {
    Stack: Object.assign((props: object) => createElement('Stack', props), {
      Screen: 'Screen',
      Protected: 'Protected',
    }),
    Tabs: Object.assign((props: object) => createElement('Tabs', props), { Screen: 'Screen' }),
    Redirect: 'Redirect',
    router: { push: h.push, replace: h.replace, back: h.back, canGoBack: () => true },
    usePathname: () => h.pathname,
    useLocalSearchParams: () => ({ id: h.tripId }),
  };
});
vi.mock('@/components/frame', () => ({
  ScreenFrame: 'ScreenFrame',
  ContentInsets: 'ContentInsets',
}));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Icon', 'Notice', 'Page', 'Title'].map((name) => [
      name,
      name,
    ])
  ),
  styles: { page: {} },
  usePalette: () => ({ surface: '#fff', background: '#fff' }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: { id: 'account', username: 'test', displayName: 'TEST account' },
    manager: { api: { environment: 'https://example/api/v1' }, logout: h.logout },
  }),
}));
vi.mock('@/features/auth/errorMessage', () => ({
  errorMessage: () => 'failure',
  isAccessDenied: (error: unknown) => error === 'denied',
}));
vi.mock('@/features/trips/queries', () => ({ useTrips: () => h.remote, useTrip: () => h.trip }));
vi.mock('@/features/expenses/entryQueries', () => ({
  useExpenseOptions: () => ({ refetch: vi.fn() }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useLocalTrips: () => h.local,
  useDraftCatalog: () => ({ catalog: { isVisible: () => h.visible } }),
}));
vi.mock('@/features/expenses/entryProvider', () => ({
  useExpenseQueue: () => ({ records: h.queue }),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({ records: h.operations }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_object, key) => String(key) }),
}));

type Element = ReactElement<Record<string, unknown>>;
function render(component: () => ReactElement | null) {
  h.i = h.j = h.k = 0;
  return component();
}
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function find(node: ReactNode, field: string, value: unknown) {
  const result = nodes(node).find((item) => item.props[field] === value);
  if (!result) throw new Error(`Missing ${field}=${String(value)}`);
  return result;
}
function press(element: Element) {
  return (element.props.onPress as () => void)();
}
beforeEach(() => {
  h.status = 'signedIn';
  h.online = h.visible = true;
  h.pathname = '/trips';
  h.tripId = 'a';
  h.state = [];
  h.refs = [];
  h.deps = [];
  h.remote.isError = h.local.isError = h.local.storageFailed = h.queue.isError = false;
  h.trip.error = undefined;
  h.push.mockReset();
  h.replace.mockReset();
  h.back.mockReset();
  h.logout.mockReset();
});

it.each(['local', 'signedIn', 'signedOut', 'loading', 'error'])(
  'guards the entire online navigator for %s',
  (status) => {
    h.status = status;
    const element = render(AppLayout);
    if (status !== 'local' && status !== 'signedIn')
      expect(element!.props).toMatchObject({ href: '/' });
    else {
      const protectedGroup = nodes(element).find((node) => node.props.guard !== undefined)!;
      expect(protectedGroup.props.guard).toBe(status === 'signedIn');
      expect(
        nodes(protectedGroup)
          .filter((node) => node.props.name)
          .map((node) => node.props.name)
      ).toEqual(['(tabs)', 'trips', 'record']);
    }
  }
);
it('opens the global action once, then allows another attempt after returning', () => {
  const props = {
    state: {
      index: 0,
      routes: [
        { name: 'trips', key: 't' },
        { name: 'me', key: 'm' },
      ],
    },
  } as unknown as Parameters<typeof GlobalTabBar>[0];
  const component = () => GlobalTabBar(props);
  let element = render(component);
  press(find(element, 'testID', 'nav-record'));
  press(find(element, 'testID', 'nav-record'));
  expect(h.push).toHaveBeenCalledOnce();
  h.pathname = '/record';
  render(component);
  h.pathname = '/trips';
  element = render(component);
  press(find(element, 'testID', 'nav-record'));
  expect(h.push).toHaveBeenCalledTimes(2);
});
it('never chooses a trip automatically, blocks rapid selection, and preserves the original cancel history', () => {
  const element = render(SelectTripScreen)! as Element;
  const list = find(element, 'testID', 'record-trips');
  expect(h.replace).not.toHaveBeenCalled();
  const item = (list.props.data as { id: string; name: string }[])[0];
  const row = (list.props.renderItem as (props: { item: typeof item }) => Element)({ item });
  press(row);
  press(row);
  expect(h.replace).toHaveBeenCalledExactlyOnceWith({
    pathname: '/trips/[id]/expenses/new',
    params: { id: 'a' },
  });
  const header = list.props.ListHeaderComponent as ReactNode;
  const cancel = nodes(header).find((node) => node.props.backTestID === 'record-cancel')!;
  (cancel.props.onBack as () => void)();
  expect(h.back).toHaveBeenCalledOnce();
});
it('offline selection uses only snapshots with options, and denial immediately removes all names', () => {
  h.online = false;
  let list = find(render(SelectTripScreen), 'testID', 'record-trips');
  expect(list.props.data).toEqual([{ id: 'a', name: 'Local A' }]);
  const item = (list.props.data as { id: string; name: string }[])[0];
  press((list.props.renderItem as (props: { item: typeof item }) => Element)({ item }));
  expect(h.replace).toHaveBeenCalledWith({ pathname: '/drafts/[id]', params: { id: 'a' } });
  h.online = true;
  h.visible = false;
  list = find(render(SelectTripScreen), 'testID', 'record-trips');
  expect(list.props.data).toEqual([]);
  expect(render(() => TripContext({ tripId: 'a' }))).toBeNull();
  h.visible = true;
  h.trip.error = 'denied';
  expect(render(() => TripContext({ tripId: 'a' }))).toBeNull();
});
it('does not turn storage failure into an empty trip list or a zero queue summary', () => {
  h.online = false;
  h.local.storageFailed = true;
  const list = find(render(SelectTripScreen), 'testID', 'record-trips');
  expect(list.props.ListEmptyComponent).toBeNull();
  expect(
    find(list.props.ListHeaderComponent as ReactNode, 'children', 'draftLoadFailed')
  ).toBeDefined();
  h.queue.isError = true;
  const work = render(LocalWorkScreen);
  expect(
    nodes(work).find((node) => node.props.label === 'queueTitle' && node.props.value === '0')
  ).toBeUndefined();
});
it('keeps account controls available after logout fails, and prevents duplicate logout', async () => {
  let reject!: (reason: unknown) => void;
  h.logout.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    })
  );
  let element = render(MyScreen);
  press(find(element, 'testID', 'logout'));
  press(find(element, 'testID', 'logout'));
  expect(h.logout).toHaveBeenCalledOnce();
  reject(new Error('storage failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  element = render(MyScreen);
  expect(find(element, 'testID', 'logout').props.busy).toBe(false);
  expect(find(element, 'children', 'failure')).toBeDefined();
});
it('uses the shared keyboard form container and forwards the route guard callback', () => {
  const onBack = vi.fn();
  const form = FormPage({ title: 'TEST form', backLabel: 'Cancel', onBack, busy: true }) as Element;
  expect(form.props.behavior).toBe('padding');
  const header = nodes(form).find((node) => node.props.backLabel === 'Cancel')!;
  expect(header.props).toMatchObject({ onBack, busy: true });
});
it('hides all trip tab content and invitation after denial, even when landing data is still cached', () => {
  const tabs = TripLayout() as Element;
  const props = {
    state: { index: 0, routes: [{ name: 'index', key: 'overview' }] },
    navigation: {},
  };
  // Invoke the navigator's actual layout callback, then its chrome; no native navigator is mounted.
  const layout = (tabs.props.layout as (props: object) => Element)({
    ...props,
    children: 'PRIVATE ledger',
  });
  const component = layout.type as (props: object) => ReactElement;
  h.visible = false;
  const chrome = render(() => component(layout.props));
  expect(nodes(chrome).some((node) => node.props.children === 'PRIVATE ledger')).toBe(false);
  expect(nodes(chrome).some((node) => node.props.testID === 'trip-invitation')).toBe(false);
  expect(find(chrome, 'children', 'notFound')).toBeDefined();
});

it.each(
  ['index', 'expenses', 'settlement'].flatMap((entry) =>
    ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'].map((id) => ({ entry, id }))
  )
)('keeps trip $id when switching from a direct $entry entry to unvisited tabs', ({ entry, id }) => {
  h.tripId = id;
  const options = {
    routeNames: ['index', 'expenses', 'settlement'],
    routeParamList: {},
    routeGetIdList: {},
  };
  const navigator = TabRouter({ backBehavior: 'none' });
  // URL entry populates the matched child; the tab router adds unvisited siblings without params.
  let state = navigator.getRehydratedState(
    { stale: true, routes: [{ name: entry, params: { id } }] },
    options
  );
  const keys = state.routes.map((route) => route.key);
  const navigation = {
    emit: vi.fn(() => ({ defaultPrevented: false })),
    navigate: (name: string, params: object | undefined) => {
      state = navigator.getRehydratedState(
        navigator.getStateForAction(
          state,
          { type: 'NAVIGATE', payload: { name, params } },
          options
        )!,
        options
      );
    },
  };
  for (const name of ['expenses', 'settlement', 'index', 'settlement', 'expenses']) {
    const tabs = TripLayout() as Element;
    const layout = (tabs.props.layout as (props: object) => Element)({
      state,
      navigation,
      children: 'ledger',
    });
    const chrome = render(() => (layout.type as (props: object) => ReactElement)(layout.props));
    press(find(chrome, 'testID', name === 'index' ? 'trip-tab-index' : `trip-${name}`));
    expect(state.routes[state.index]).toMatchObject({ name, params: { id } });
    expect(state.routes.map((route) => route.key)).toEqual(keys);
  }
});

it('uses visible pending counts while keeping terminal notices and local-only permissions separate', () => {
  const scope = { environment: 'https://example/api/v1', accountId: 'account', tripId: 'a' };
  h.queue.data = [
    { ...scope, status: 'queued' },
    { ...scope, status: 'resolved' },
    { ...scope, accountId: 'other', status: 'prepared' },
  ];
  h.operations.data = [
    { ...scope, status: 'pending' },
    { ...scope, status: 'completed' },
  ];
  let work = render(LocalWorkScreen);
  expect(find(work, 'label', 'queueTitle').props.value).toBe('1');
  expect(find(work, 'label', 'pendingOperations').props.value).toBe('1');
  h.visible = false;
  work = render(LocalWorkScreen);
  expect(find(work, 'label', 'queueTitle').props.value).toBe('0');
  expect(find(work, 'label', 'pendingOperations').props.value).toBe('0');
  h.status = 'local';
  h.visible = true;
  work = render(LocalWorkScreen);
  expect(find(work, 'label', 'queueTitle').props.value).toBe('1');
  expect(nodes(work).some((n) => n.props.testID === 'pending-operations')).toBe(false);
  h.queue.isError = true;
  expect(
    nodes(render(LocalWorkScreen)).some(
      (n) => n.props.label === 'queueTitle' && n.props.value !== undefined
    )
  ).toBe(false);
});
