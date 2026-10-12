import { formatDate } from '@/i18n/format';
import { onlineManager } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import AppLayout from '@/app/(app)/_layout';
import { MyScreen } from './MyScreen';
import { TripCandidateRow } from './TripCandidateRow';
import { SelectTripScreen } from './SelectTripScreen';
import { LocalWorkScreen } from './LocalWorkScreen';
import { TripContext } from './TripContext';
import { GlobalLayout, GlobalTabBar, TripLayout } from './layouts';
import { NavigationMenu } from '@/components/NavigationMenu';
import { ScrollChromeProvider } from '@/components/scrollChrome';
import { FormPage } from '@/components/screen';
import { EntryGroup } from '@/components/EntryGroup';
import { LocalWorkLink } from '@/features/trips/LocalWorkLink';
import { TabRouter } from 'expo-router/build/react-navigation/routers';

vi.mock('@/features/expenses/PendingReceipts', () => ({ PendingReceipts: 'PendingReceipts' }));
const h = vi.hoisted(() => ({
  status: 'signedIn',
  actor: 'account',
  version: 1,
  hidden: false,
  candidates: vi.fn(),
  online: true,
  pathname: '/trips',
  tripId: 'a',
  fontScale: 1,
  width: 390,
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
          metadata: { counts: { archived: 2, unarchived: 43 }, quickAdd: { directTripId: 'a' } },
          items: [
            {
              id: 'a',
              name: 'Trip A',
              archived: false,
              startDate: null,
              endDate: null,
              phase: 'unscheduled',
            },
            {
              id: 'b',
              name: 'Trip B',
              archived: false,
              startDate: null,
              endDate: null,
              phase: 'unscheduled',
            },
          ],
        },
      ],
    },
    isPending: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
    refresh: vi.fn(),
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  local: {
    data: [
      {
        tripId: 'a',
        name: 'Local A',
        archived: null as boolean | null,
        options: {} as object | undefined,
      },
      { tripId: 'b', name: 'Local B', archived: null as boolean | null, options: undefined },
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
  useWindowDimensions: () => ({ width: h.width, height: 844, fontScale: h.fontScale, scale: 3 }),
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
  useContentEdges: () => ['top', 'left', 'right'],
}));
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Icon', 'Notice', 'Page', 'Section', 'Title'].map(
      (name) => [name, name]
    )
  ),
  styles: { page: {} },
  usePalette: () => ({ surface: '#fff', background: '#fff' }),
}));
vi.mock('@/features/preferences/context', () => ({
  usePreferences: () => ({ value: { language: 'system', appearance: 'dark' }, loaded: true }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: { id: 'account', username: 'test', displayName: 'TEST account' },
    manager: {
      api: { environment: 'https://example/api/v1' },
      logout: h.logout,
      getSignInVersion: () => h.version,
      getSnapshot: () => ({ status: h.status, user: { id: h.actor } }),
    },
  }),
}));
vi.mock('@/features/auth/errorMessage', () => ({
  errorMessage: () => 'failure',
  isAccessDenied: (error: unknown) => error === 'denied',
}));
vi.mock('@/features/trips/queries', () => ({
  useTripCandidates: (enabled: boolean) => {
    h.candidates(enabled);
    return h.remote;
  },
  useTrip: () => h.trip,
}));
vi.mock('@/features/expenses/entryQueries', () => ({
  useExpenseOptions: () => ({ refetch: vi.fn() }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useLocalTrips: () => h.local,
  useDraftCatalog: () => ({
    catalog: {
      isVisible: () => h.visible,
      hasDenied: () => h.hidden,
      captureAccess: () => () => {
        if (!h.visible) throw new Error('denied');
      },
    },
  }),
}));
vi.mock('@/features/expenses/entryProvider', () => ({
  useExpenseQueue: () => ({ records: h.queue }),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({ records: h.operations }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/i18n/useDisplayFormat', () => ({ useDisplayFormat: () => ({ locale: 'en' }) }));
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
  if (element.type === TripCandidateRow)
    return [
      element,
      ...nodes(TripCandidateRow(element.props as Parameters<typeof TripCandidateRow>[0])),
    ];
  if (element.type === EntryGroup)
    return [element, ...nodes(EntryGroup(element.props as Parameters<typeof EntryGroup>[0]))];
  if (element.type === LocalWorkLink) return nodes(LocalWorkLink(element.props));
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
  h.actor = 'account';
  h.version = 1;
  h.hidden = false;
  vi.spyOn(onlineManager, 'isOnline').mockImplementation(() => h.online);
  h.online = h.visible = true;
  h.pathname = '/trips';
  h.tripId = 'a';
  h.fontScale = 1;
  h.width = 390;
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
      ).toEqual([
        '(tabs)',
        'trips',
        'record',
        'profile',
        'avatar',
        'password',
        'email',
        'notifications',
        'friends',
      ]);
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
  const button = find(row, 'testID', `record-trip-${item.id}`);
  press(button);
  press(button);
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
  expect(list.props.data).toEqual([{ id: 'a', name: 'Local A', localGroup: 'unknown' }]);
  const item = (list.props.data as { id: string; name: string }[])[0];
  press(
    find(
      (list.props.renderItem as (props: { item: typeof item; index: number }) => Element)({
        item,
        index: 0,
      }),
      'testID',
      'record-trip-a'
    )
  );
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
  element = render(MyScreen);
  for (const testID of [
    'my-profile',
    'my-email',
    'my-password',
    'my-friends',
    'my-preferences',
    'my-local-work',
    'my-about',
  ]) {
    expect(find(element, 'testID', testID).props.disabled).toBe(true);
    press(find(element, 'testID', testID));
  }
  expect(h.push).not.toHaveBeenCalled();
  reject(new Error('storage failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  element = render(MyScreen);
  expect(find(element, 'testID', 'logout').props.busy).toBe(false);
  expect(find(element, 'children', 'failure')).toBeDefined();
  press(find(element, 'testID', 'my-preferences'));
  expect(h.push).toHaveBeenLastCalledWith('/preferences');
  press(find(element, 'testID', 'my-local-work'));
  expect(h.push).toHaveBeenLastCalledWith('/work');
  press(find(element, 'testID', 'my-profile'));
  expect(h.push).toHaveBeenLastCalledWith('/profile');
  press(find(element, 'testID', 'my-password'));
  expect(h.push).toHaveBeenLastCalledWith('/password');
  press(find(element, 'testID', 'my-about'));
  expect(h.push).toHaveBeenLastCalledWith('/about');
});
it('orders account, preferences/about and local work before logout, with existing offline destinations', () => {
  h.online = false;
  const tree = render(MyScreen);
  const sections = nodes(tree)
    .filter((node) => node.type === 'Section')
    .map((node) => node.props.title);
  expect(sections).toEqual(['accountSection', 'preferences']);
  expect(find(tree, 'label', 'displayName').props.value).toBe('TEST account');
  expect(find(tree, 'testID', 'my-preferences').props.accessibilityLabel).toContain(
    'preferenceDark'
  );
  for (const testID of [
    'my-profile',
    'my-email',
    'my-password',
    'my-friends',
    'my-preferences',
    'my-local-work',
    'my-about',
  ])
    expect(find(tree, 'testID', testID).props.disabled).toBe(false);
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
    ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'].flatMap((id) =>
      [1, 1.5, 3].map((fontScale) => ({ entry, id, fontScale }))
    )
  )
)('keeps trip $id from a direct $entry entry at scale $fontScale', ({ entry, id, fontScale }) => {
  h.fontScale = fontScale;
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
    if (fontScale >= 1.5) {
      const provider = nodes(chrome).find((node) => node.type === ScrollChromeProvider)!;
      const header = provider.props.header as ReactNode;
      const menu = nodes(header).find((node) => node.type === NavigationMenu)!;
      const choices = menu.props.choices as { name: string; onPress: () => void }[];
      choices.find((choice) => choice.name === name)!.onPress();
      expect(nodes(chrome).some((node) => node.type === 'SafeAreaView')).toBe(false);
    } else press(find(chrome, 'testID', name === 'index' ? 'trip-tab-index' : `trip-${name}`));
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
  expect(find(work, 'testID', 'local-queue').props.accessibilityLabel).toBe('queueTitle. 1');
  expect(find(work, 'testID', 'pending-operations').props.accessibilityLabel).toBe(
    'pendingOperations. 1'
  );
  h.visible = false;
  work = render(LocalWorkScreen);
  expect(find(work, 'testID', 'local-queue').props.accessibilityLabel).toBe('queueTitle. 0');
  expect(find(work, 'testID', 'pending-operations').props.accessibilityLabel).toBe(
    'pendingOperations. 0'
  );
  h.status = 'local';
  h.visible = true;
  work = render(LocalWorkScreen);
  expect(find(work, 'testID', 'local-queue').props.accessibilityLabel).toBe('queueTitle. 1');
  expect(nodes(work).some((n) => n.props.testID === 'pending-operations')).toBe(false);
  h.queue.isError = true;
  expect(
    nodes(render(LocalWorkScreen)).some(
      (n) => n.props.testID === 'local-queue' && n.props.accessibilityLabel !== 'queueTitle'
    )
  ).toBe(false);
});

it('moves global navigation into content at large scale and keeps footer safe areas at normal scale', () => {
  h.fontScale = 3;
  let tabs = render(GlobalLayout) as Element;
  const props = {
    state: {
      index: 1,
      routes: [
        { name: 'trips', key: 'trips' },
        { name: 'me', key: 'me' },
      ],
    },
    navigation: { emit: vi.fn(() => ({ defaultPrevented: false })), navigate: vi.fn() },
    children: 'content',
  };
  const layout = (tabs.props.layout as (props: object) => Element)(props);
  expect(layout.type).toBe(ScrollChromeProvider);
  expect(find(layout, 'children', 'content').props.edges).toContain('bottom');
  const bar = layout.props.header as Element;
  const menu = render(() =>
    GlobalTabBar(bar.props as Parameters<typeof GlobalTabBar>[0])
  ) as Element;
  expect(menu.type).toBe(NavigationMenu);
  expect(menu.props.label).toBe('myAccount');
  const choices = menu.props.choices as {
    testID: string;
    onPress: () => void;
    selected?: boolean;
  }[];
  expect(choices.find((choice) => choice.testID === 'nav-me')?.selected).toBe(true);
  choices.find((choice) => choice.testID === 'nav-record')!.onPress();
  choices.find((choice) => choice.testID === 'nav-record')!.onPress();
  expect(h.push).toHaveBeenCalledExactlyOnceWith('/record');
  const footer = (tabs.props.tabBar as (props: object) => Element)(props);
  expect(render(() => GlobalTabBar(footer.props as Parameters<typeof GlobalTabBar>[0]))).toBeNull();
  // No navigator key or replacement is introduced when the display configuration changes.
  h.fontScale = 1;
  tabs = render(GlobalLayout) as Element;
  expect(tabs.key).toBeNull();
  const normal = (tabs.props.layout as (props: object) => Element)(props);
  expect(normal.props.header).toBeNull();
  expect(find(normal, 'children', 'content').props.edges).not.toContain('bottom');
});

it('withholds cached trip names inside compact menus after revocation and keeps Back available', () => {
  h.fontScale = 3;
  h.visible = false;
  const tabs = TripLayout() as Element;
  const layout = (tabs.props.layout as (props: object) => Element)({
    state: { index: 0, routes: [{ name: 'index', key: 'overview' }] },
    navigation: {},
    children: 'PRIVATE ledger',
  });
  const chrome = render(() => (layout.type as (props: object) => ReactElement)(layout.props));
  const provider = nodes(chrome).find((node) => node.type === ScrollChromeProvider)!;
  const header = provider.props.header as ReactNode;
  expect(find(header, 'testID', 'trip-navigation-menu').props.context).toBeUndefined();
  expect(nodes(header).some((node) => node.props.testID === 'trip-invitation')).toBe(false);
  expect(find(header, 'testID', 'trip-back')).toBeDefined();
  expect(find(chrome, 'children', 'notFound')).toBeDefined();
  expect(nodes(chrome).some((node) => node.props.children === 'PRIVATE ledger')).toBe(false);
});

it('keeps measured overflow in menu mode when moving the header into the padded scroller', () => {
  const props = {
    state: {
      index: 0,
      routes: [
        { name: 'index', key: 'overview' },
        { name: 'expenses', key: 'expenses' },
        { name: 'settlement', key: 'settlement' },
      ],
    },
    navigation: {},
    children: 'ledger',
  };
  const tabs = TripLayout() as Element;
  const layout = (tabs.props.layout as (props: object) => Element)(props);
  const chrome = () => render(() => (layout.type as (props: object) => ReactElement)(layout.props));
  let tree = chrome();
  const row = find(tree, 'testID', 'trip-tab-index');
  (row.props.onTextLayout as (event: object) => void)({ nativeEvent: { lines: [{}, {}] } });
  tree = chrome();
  const provider = nodes(tree).find((node) => node.type === ScrollChromeProvider)!;
  const header = provider.props.header as Element;
  expect(find(header, 'testID', 'trip-navigation-menu').props.iconOnly).toBe(false);
  expect(header.props.onLayout).toBeUndefined();
  // Rotation invalidates the old width and allows a new fixed-row measurement.
  h.width = 768;
  tree = chrome();
  expect(nodes(tree).some((node) => node.type === 'SafeAreaView')).toBe(true);
});
it.each(['account', 'login', 'revoked', 'offline'])(
  'a stale candidate handler cannot navigate after %s changes',
  (kind) => {
    const list = find(render(SelectTripScreen), 'testID', 'record-trips');
    const item = (list.props.data as { id: string; name: string }[])[0];
    const row = (list.props.renderItem as (props: { item: typeof item; index: number }) => Element)(
      { item, index: 0 }
    );
    if (kind === 'account') h.actor = 'other';
    if (kind === 'login') h.version++;
    if (kind === 'revoked') h.visible = false;
    if (kind === 'offline') h.online = false;
    press(find(row, 'testID', 'record-trip-a'));
    expect(h.replace).not.toHaveBeenCalled();
  }
);
it('candidate rows include full names, shared literal dates and phases without financial amounts', () => {
  const item = {
    id: 'a',
    name: 'Long travel name '.repeat(20),
    trip: {
      id: 'a',
      name: 'Long travel name '.repeat(20),
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      phase: 'ongoing' as const,
      archived: false,
      memberCount: 2,
      description: null,
      destination: null,
      mySpent: 123456,
      myBalance: 987654,
    },
  };
  const row = render(() => TripCandidateRow({ item, onPress: vi.fn() }))!;
  const button = find(row, 'testID', 'record-trip-a');
  expect(button.props.accessibilityLabel).toContain(item.name);
  expect(button.props.accessibilityLabel).toContain(formatDate('2026-10-12', 'en'));
  expect(button.props.accessibilityLabel).toContain('ongoing');
  expect(button.props.accessibilityLabel).not.toContain('123456');
  expect(nodes(row).some((n) => n.props.numberOfLines !== undefined)).toBe(false);
});
it('an archived-only account links to archived trips and keeps create/join, without claiming there are no trips', () => {
  const pages = h.remote.data.pages;
  h.remote.data.pages = [{ ...pages[0], items: [] }];
  const list = find(render(SelectTripScreen), 'testID', 'record-trips');
  const empty = list.props.ListEmptyComponent as ReactNode;
  expect(find(empty, 'children', 'noRecordTrips')).toBeDefined();
  expect(find(empty, 'label', 'createTrip')).toBeDefined();
  expect(find(empty, 'label', 'joinTrip')).toBeDefined();
  press(find(empty, 'testID', 'record-view-archived'));
  expect(h.replace).toHaveBeenCalledExactlyOnceWith({
    pathname: '/trips',
    params: { archive: 'archived' },
  });
  h.remote.data.pages = pages;
});
it('refresh uses the first-page reset entry and local-only login never enables the remote candidate query', () => {
  const list = find(render(SelectTripScreen), 'testID', 'record-trips');
  const refresh = list.props.refreshControl as Element;
  (refresh.props.onRefresh as () => void)();
  expect(h.remote.refresh).toHaveBeenCalled();
  h.status = 'local';
  const local = find(render(SelectTripScreen), 'testID', 'record-trips');
  expect(h.candidates).toHaveBeenLastCalledWith(false);
  expect(local.props.data).toEqual([{ id: 'a', name: 'Local A', localGroup: 'unknown' }]);
});
it('known revocation hides candidates without removing the manual archive entry or showing uncertain totals', () => {
  const metadata = h.remote.data.pages[0].metadata;
  h.remote.data.pages[0].metadata = { ...metadata, counts: { archived: 0, unarchived: 43 } };
  h.hidden = true;
  h.visible = false;
  try {
    const list = find(render(SelectTripScreen), 'testID', 'record-trips');
    expect(list.props.data).toEqual([]);
    const link = find(list.props.ListEmptyComponent as ReactNode, 'testID', 'record-view-archived');
    expect(link.props.label).toBe('viewArchivedTrips');
    expect(h.replace).not.toHaveBeenCalled();
  } finally {
    h.remote.data.pages[0].metadata = metadata;
  }
});
