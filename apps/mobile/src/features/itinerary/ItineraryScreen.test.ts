import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { Itinerary } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { ApiError } from '@/api/client';
import { colors } from '@/theme/tokens';
import { ItineraryScreen, ActivityCard } from './ItineraryScreen';
import { locationName } from './presentation';
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
const h = vi.hoisted(() => ({
  selected: null as string | null,
  locale: 'en' as keyof typeof messages,
  visible: true,
  online: true,
  status: 'signedIn',
  account: 'a'.repeat(24),
  query: {
    data: undefined as Itinerary | undefined,
    error: null as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
    isRefetching: false,
    refresh: vi.fn(),
  },
}));
vi.mock('./ActivityActions', () => ({ ActivityActions: 'ActivityActions' }));
vi.mock('@/features/trips/queries', () => ({
  useTrip: () => ({ data: { role: 'admin' }, isError: false }),
}));
vi.mock('./DayActions', () => ({ DayActions: 'DayActions' }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    h.selected,
    (value: string) => {
      h.selected = value;
    },
  ],
}));
vi.mock('react-native', () =>
  Object.fromEntries(['FlatList', 'View', 'Text', 'ActivityIndicator'].map((n) => [n, n]))
);
vi.mock('@/components/ui', () => ({
  ...Object.fromEntries(
    ['Icon', 'Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Page', 'Section', 'Title'].map(
      (n) => [n, n]
    )
  ),
  usePalette: () => colors.light,
}));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/scrollChrome', () => ({ ScrollChrome: 'ScrollChrome' }));
vi.mock('@/components/NavigationMenu', () => ({ NavigationMenu: 'NavigationMenu' }));
vi.mock('@/components/Disclosure', () => ({ Disclosure: 'Disclosure' }));
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => messages[h.locale],
  useAppLocale: () => h.locale,
}));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ date: (value: string) => value }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: h.status,
    user: { id: h.account },
    manager: { api: { environment: 'https://test' }, getSignInVersion: () => 1 },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: () => h.visible } }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('./queries', () => ({ useItinerary: () => h.query }));
const tripId = 'b'.repeat(24);
const id = (n: number) => n.toString(16).padStart(24, '0');
const activity = {
  id: id(3),
  title: '超長活動名稱 '.repeat(30),
  type: 'transport' as const,
  time: '08:00',
  endTime: '09:00',
  note: '多行備註\n'.repeat(100),
  confirmationCode: 'PRIVATE-CODE',
  location: null,
  locationName: '車站',
};
const itinerary: Itinerary = {
  tripId,
  startDate: null,
  endDate: null,
  days: [
    {
      id: id(1),
      dayNumber: 2,
      date: null,
      outsideTripRange: false,
      title: 'PRIVATE Day 2',
      content: '# 原始內容\n第二行',
      location: null,
      activities: [activity],
    },
    {
      id: id(2),
      dayNumber: 5,
      date: null,
      outsideTripRange: false,
      title: 'PRIVATE Day 5',
      content: '',
      location: null,
      activities: [],
    },
  ],
};
type Node = ReactElement<
  Record<string, unknown> & {
    children: ReactNode;
    ListHeaderComponent: ReactNode;
    ListFooterComponent: ReactNode;
    onPress: () => void;
    choices: { selected: boolean; onPress: () => void }[];
    data: unknown[];
  }
>;
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const element = node as Node;
  if (typeof element.type === 'function')
    return expand((element.type as (props: object) => ReactNode)(element.props));
  return { ...element, props: { ...element.props, children: expand(element.props.children) } };
}
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as Node;
  return [
    element,
    ...nodes(element.props.children),
    ...nodes(element.props.ListHeaderComponent),
    ...nodes(element.props.ListFooterComponent),
  ];
}
const screen = () => expand(ItineraryScreen({ tripId }));
const find = (tree: ReactNode, field: string, value: unknown) =>
  nodes(tree).find((n) => n.props[field] === value)!;
beforeEach(() => {
  h.selected = null;
  h.visible = true;
  h.online = true;
  h.status = 'signedIn';
  h.locale = 'en';
  h.account = 'a'.repeat(24);
  Object.assign(h.query, {
    data: structuredClone(itinerary),
    error: null,
    isError: false,
    isPending: false,
    isFetching: false,
    isRefetching: false,
  });
  h.query.refresh.mockClear();
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'supports %s numbered days/gaps, selection and existing-day navigation',
  (locale) => {
    h.locale = locale;
    let tree = screen();
    const selector = nodes(tree).find((n) => n.props.selectedId === id(1))!;
    expect(selector.props.days).toEqual(itinerary.days);
    (selector.props.select as (id: string) => void)(id(2));
    tree = screen();
    const next = nodes(tree).find((n) => n.props.selectedId === id(2))!;
    expect(next).toBeDefined();
    expect(find(tree, 'children', messages[locale].itineraryNoActivities)).toBeDefined();
    (next.props.select as (id: string) => void)(id(1));
    expect(find(screen(), 'testID', 'itinerary-list').props.data).toHaveLength(1);
  }
);
it('preserves all long details, legacy type, location and private member-only booking code without truncation', () => {
  const tree = expand(ActivityCard({ activity }));
  expect(find(tree, 'children', activity.title)).toBeDefined();
  expect(find(tree, 'children', activity.note).props.numberOfLines).toBeUndefined();
  expect(find(tree, 'value', activity.confirmationCode)).toBeDefined();
  expect(find(tree, 'children', activity.locationName)).toBeDefined();
  expect(
    locationName(
      { name: '原名', names: { jp: '日本語' }, display_name: '', lat: 0, lon: 0 },
      '',
      'jp'
    )
  ).toBe('日本語');
});
it('keeps the selected stable ID through a refresh and falls back after the selected day is deleted', () => {
  h.selected = id(2);
  expect(find(screen(), 'testID', 'itinerary-list').props.data).toHaveLength(0);
  h.query.data = { ...itinerary, days: [itinerary.days[0]] };
  expect(find(screen(), 'testID', 'itinerary-list').props.data).toHaveLength(1);
});
it('provides loading, empty, offline and failed-read retry states without inventing content', () => {
  h.query.data = undefined;
  h.query.isPending = true;
  expect(find(screen(), 'accessibilityLabel', messages.en.loading)).toBeDefined();
  h.query.isPending = false;
  h.query.isError = true;
  h.query.error = new ApiError('NETWORK');
  find(screen(), 'label', messages.en.retry).props.onPress();
  expect(h.query.refresh).toHaveBeenCalledTimes(1);
  h.query.isError = false;
  h.query.data = { ...itinerary, days: [] };
  expect(find(screen(), 'children', messages.en.itineraryEmpty)).toBeDefined();
  h.online = false;
  expect(find(screen(), 'children', messages.en.offline)).toBeDefined();
  expect(find(screen(), 'testID', 'itinerary-list').props.onRefresh).toBeUndefined();
});
it.each(['catalog', 'http', 'session'])(
  'withholds all cached content after %s denial',
  (source) => {
    if (source === 'catalog') h.visible = false;
    if (source === 'http') h.query.error = new ApiError('NOT_FOUND', 404);
    if (source === 'session') h.status = 'signedOut';
    const tree = screen();
    expect(find(tree, 'testID', 'itinerary-list')).toBeUndefined();
    expect(find(tree, 'children', messages.en.notFound)).toBeDefined();
  }
);
it('CD2 keeps date relationships in the row and accessible details while keeping the visible details control short', () => {
  const overnight = { ...activity, time: '22:25', endTime: '00:20', endDayOffset: 1 };
  const tree = expand(
    ActivityCard({ activity: overnight, day: { dayNumber: 2, date: '2028-02-29' } })
  );
  const details = find(tree, 'testID', `itinerary-activity-${activity.id}`);
  expect(details.props.title).toBe(messages.en.itineraryDetails);
  expect(details.props.accessibilityLabel).toContain('2028-03-01 00:20');
  expect(details.props.accessibilityLabel).toContain(activity.title);
  expect(find(tree, 'children', 'Next day 00:20')).toBeDefined();
  expect(
    find(tree, 'testID', `itinerary-activity-row-${activity.id}`).props.style
  ).not.toHaveProperty('borderRadius');
});
