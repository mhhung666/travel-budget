import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { ItineraryEditContext } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { batchDeletionMessages } from '@/i18n/batchDeletionMessages';
import { colors } from '@/theme/tokens';
import { ApiError } from '@/api/client';
import { ActivityBatchScreen } from './ActivityBatchScreen';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => void | (() => void))[],
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
  pause: vi.fn(),
  dispatch: vi.fn(),
  push: vi.fn(),
  alert: vi.fn(),
  deny: vi.fn(),
  online: true,
  visible: true,
  version: 1,
  account: 'a'.repeat(24),
  environment: 'https://test/api/v1',
  locale: 'en' as keyof typeof messages,
  status: 'signedIn',
  prevent: false,
  live: undefined as unknown,
  leave: undefined as undefined | ((args: { data: { action: unknown } }) => void),
  records: {
    data: [] as unknown[],
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
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
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useLayoutEffect: (effect: () => void) => effect(),
  useEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
vi.mock('react-native', () => ({
  Alert: { alert: h.alert },
  AppState: { currentState: 'active' },
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
}));
vi.mock('expo-router', () => ({
  router: { push: h.push },
  useNavigation: () => ({ dispatch: h.dispatch }),
}));
vi.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (value: boolean, cb: typeof h.leave) => {
    h.prevent = value;
    h.leave = cb;
  },
}));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => h.online } }));
vi.mock('@/components/NavigationMenu', () => ({ NavigationMenu: 'NavigationMenu' }));
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('./queries', () => ({ useItinerary: () => ({ data: h.live, error: null }) }));
vi.mock('@/i18n/useDisplayFormat', () => ({
  useDisplayFormat: () => ({ date: (v: string) => v }),
}));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () => ({
  usePalette: () => colors.light,
  ...Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField', 'Title'].map((n) => [
      n,
      n,
    ])
  ),
}));
vi.mock('@/i18n/useMessages', () => ({
  useAppLocale: () => h.locale,
  useMessages: () => messages[h.locale],
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
const manager = {
  api: {
    get environment() {
      return h.environment;
    },
  },
  getSnapshot: () => ({ status: h.status, user: { id: h.account } }),
  getSignInVersion: () => h.version,
  requestAs: h.request,
};
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ manager, user: { id: h.account }, status: h.status }),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    manager,
    scope: { environment: h.environment, accountId: h.account },
    records: h.records,
    entry: { confirm: h.confirm },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      isVisible: () => h.visible,
      captureAccess: () => () => {
        if (!h.visible) throw new ApiError('CANCELLED');
      },
      deny: h.deny,
    },
  }),
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    get: h.get,
    retryAt: async () => 0,
    rateLimitUntil: () => 0,
    pause: h.pause,
  }),
}));
const tripId = 'b'.repeat(24),
  dayId = 'c'.repeat(24),
  activityId = 'd'.repeat(24);
const data: ItineraryEditContext = {
  tripId,
  startDate: '2026-11-03',
  endDate: '2026-11-05',
  days: [
    {
      id: dayId,
      dayNumber: 1,
      date: '2026-11-03',
      title: 'Original',
      content: 'Private notes',
      location: null,
      outsideTripRange: false,
      revision: 2,
      deleteImpact: {
        revision: 'a'.repeat(64),
        activityCount: 3,
        attachmentCount: 4,
        expenseCount: 5,
        photoCount: 6,
      },
      activities: [
        {
          id: activityId,
          revision: 5,
          title: 'Breakfast',
          type: 'food',
          time: '09:00',
          endTime: null,
          location: null,
          locationName: 'Cafe',
          note: 'Private notes',
          confirmationCode: '00120',
        },
      ],
    },
  ],
};
const second = 'e'.repeat(24);
data.days[0].activities.push({ ...data.days[0].activities[0], id: second, time: '12:00' });
data.days.push({
  ...structuredClone(data.days[0]),
  id: 'f'.repeat(24),
  dayNumber: 2,
  title: 'Other day',
});
function previewData(overrides = {}) {
  return {
    tripId,
    dayId,
    dayNumber: 1,
    title: 'Original',
    date: '2026-11-03',
    targets: data.days[0].activities
      .filter((a) => a.id === activityId)
      .map((a) => ({
        activityId: a.id,
        revision: a.revision,
        title: a.title,
        time: a.time,
        endTime: a.endTime,
        locationName: a.locationName,
      })),
    missingIds: [],
    changedIds: [],
    contextRevision: 'a'.repeat(64),
    ...overrides,
  };
}
type Props = Record<string, unknown> & {
  children: ReactNode;
  onPress: () => unknown;
  onChangeText: (v: string) => void;
};
type Node = ReactElement<Props>;
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const n = node as Node;
  if (typeof n.type === 'function')
    return expand((n.type as (props: object) => ReactNode)(n.props));
  return { ...n, props: { ...n.props, children: expand(n.props.children) } };
}
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const n = node as Node;
  return [
    n,
    ...nodes(n.props.children),
    ...nodes(n.props.ListHeaderComponent as ReactNode),
    ...nodes(n.props.ListFooterComponent as ReactNode),
    ...((n.props.data as unknown[] | undefined) ?? []).flatMap((item) =>
      nodes((n.props.renderItem as (p: { item: unknown }) => ReactNode)?.({ item }))
    ),
  ];
}
let props: Parameters<typeof ActivityBatchScreen>[0];
const render = () => {
  h.i = 0;
  h.j = 0;
  h.effects = [];
  return expand(ActivityBatchScreen(props));
};
const find = (key: string, value: unknown) => nodes(render()).find((n) => n.props[key] === value)!;
const button = (label: string) =>
  nodes(render()).find(
    (n) => n.props.label === label && (n.props.onPress || n.props.onChangeText)
  )!;
const copy = batchDeletionMessages.en;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  render();
}
async function mount() {
  render();
  h.effects.forEach((fn) => fn());
  await settle();
}
async function review() {
  find('testID', 'batch-review').props.onPress();
  await settle();
}
beforeEach(() => {
  h.values = [];
  h.refs = [];
  h.i = 0;
  h.j = 0;
  h.effects = [];
  h.online = true;
  h.visible = true;
  h.version = 1;
  h.account = 'a'.repeat(24);
  h.environment = 'https://test/api/v1';
  h.locale = 'en';
  h.status = 'signedIn';
  Object.assign(h.records, { data: [], isError: false, isPending: false, isFetching: false });
  for (const fn of [h.request, h.confirm, h.get, h.pause, h.alert, h.dispatch, h.push, h.deny])
    fn.mockReset();
  h.live = structuredClone(data);
  h.request.mockImplementation(async (_a, path, _schema, opts) => {
    opts?.beforeSend?.();
    return path.endsWith('/preview') ? previewData() : structuredClone(data);
  });
  h.confirm.mockResolvedValue({
    kind: 'pending',
    clientRequestId: '12345678-1234-4234-8234-123456789abc',
  });
  props = { tripId, dayId };
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'starts with zero checked rows and supports %s labels, mixed selection and whole-row controls',
  async (locale) => {
    h.locale = locale;
    await mount();
    expect(find('testID', 'batch-review').props.disabled).toBe(true);
    const row = find('testID', `batch-activity-${activityId}`);
    expect(row.props.accessibilityRole).toBe('checkbox');
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    expect(row.props.accessibilityLabel).toContain('09:00');
    row.props.onPress();
    expect(find('testID', 'batch-all').props.accessibilityState).toMatchObject({
      checked: 'mixed',
    });
    find('testID', 'batch-all').props.onPress();
    expect(find('testID', 'batch-all').props.accessibilityState).toMatchObject({ checked: true });
    expect(h.prevent).toBe(true);
  }
);
it('previews before submitting, cancels review without losing selection, then confirms once with a frozen batch', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  await review();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(find('testID', 'batch-confirm').props.disabled).toBe(false);
  find('testID', 'batch-cancel').props.onPress();
  expect(find('testID', `batch-activity-${activityId}`).props.accessibilityState).toMatchObject({
    checked: true,
  });
  await review();
  const confirm = find('testID', 'batch-confirm');
  confirm.props.onPress();
  confirm.props.onPress();
  await settle();
  expect(h.confirm).toHaveBeenCalledTimes(1);
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'activities.delete',
    tripId,
    body: {
      dayId,
      targets: [{ activityId, expectedRevision: 5 }],
      expectedContextRevision: 'a'.repeat(64),
    },
  });
  expect(find('testID', 'batch-confirm')).toBeUndefined();
  expect(find('label', messages.en.pendingOperations)).toBeDefined();
});
it('requires explicit adoption and a second preview after selected versions or day metadata change', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  h.request.mockResolvedValueOnce(
    previewData({
      title: 'Changed day',
      changedIds: [activityId],
      targets: [{ ...previewData().targets[0], title: 'Dinner', revision: 6 }],
    })
  );
  await review();
  expect(find('testID', 'batch-confirm').props.disabled).toBe(true);
  find('testID', 'batch-adopt').props.onPress();
  expect(find('testID', 'batch-confirm')).toBeUndefined();
  expect(h.confirm).not.toHaveBeenCalled();
  h.request.mockResolvedValueOnce(
    previewData({
      title: 'Changed day',
      targets: [{ ...previewData().targets[0], title: 'Dinner', revision: 6 }],
    })
  );
  await review();
  expect(find('testID', 'batch-confirm').props.disabled).toBe(false);
  find('testID', 'batch-confirm').props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body.targets[0].expectedRevision).toBe(6);
});
it('missing selections are removed explicitly; whole-day NOT_FOUND does not disable selection for another day', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  h.request.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  await review();
  expect(h.deny).not.toHaveBeenCalled();
  expect(find('testID', 'batch-confirm')).toBeUndefined();
  find('testID', 'batch-remove-missing').props.onPress();
  expect(find('testID', 'batch-review').props.disabled).toBe(true);
  const picker = find('title', messages.en.itineraryChooseDay);
  (picker.props.choices as { onPress: () => void }[])[1].onPress();
  expect(h.alert).not.toHaveBeenCalled();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  expect(find('testID', 'batch-review').props.disabled).toBe(false);
});
it('warns before changing days/leaving, cancellation keeps selection, explicit cancellation clears without confirmation', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  render();
  h.leave!({ data: { action: 'back' } });
  expect(h.alert).toHaveBeenCalled();
  expect(h.dispatch).not.toHaveBeenCalled();
  expect(find('testID', `batch-activity-${activityId}`).props.accessibilityState).toMatchObject({
    checked: true,
  });
  const choices = find('title', messages.en.itineraryChooseDay).props.choices as {
    onPress: () => void;
  }[];
  choices[1].onPress();
  expect(h.alert).toHaveBeenCalledTimes(2);
  const buttons = h.alert.mock.calls.at(-1)![2];
  buttons[1].onPress();
  expect(find('testID', 'batch-review').props.disabled).toBe(true);
});
it('does not silently rebase selected versions on refresh and select-all', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  const newer = structuredClone(data);
  newer.days[0].activities[0].revision = 6;
  h.request.mockResolvedValueOnce(newer);
  button(messages.en.refresh).props.onPress();
  await settle();
  find('testID', 'batch-all').props.onPress();
  h.request.mockResolvedValueOnce(
    previewData({
      targets: newer.days[0].activities.map((a) => ({
        activityId: a.id,
        revision: a.revision,
        title: a.title,
        time: a.time,
        endTime: a.endTime,
        locationName: a.locationName,
      })),
      changedIds: [activityId],
    })
  );
  await review();
  expect(
    h.request.mock.calls
      .at(-1)![3]
      .body.targets.find((v: { activityId: string }) => v.activityId === activityId)
      .expectedRevision
  ).toBe(5);
  expect(find('testID', 'batch-confirm').props.disabled).toBe(true);
});
it('does not truncate select-all when a historical day contains over 15 activities', async () => {
  const many = structuredClone(data);
  many.days[0].activities = Array.from({ length: 16 }, (_, i) => ({
    ...data.days[0].activities[0],
    id: i.toString(16).padStart(24, '0'),
  }));
  h.request.mockResolvedValueOnce(many);
  await mount();
  expect(find('testID', 'batch-all').props.disabled).toBe(true);
  for (const a of many.days[0].activities) find('testID', `batch-activity-${a.id}`).props.onPress();
  const checked = nodes(render()).filter(
    (n) =>
      (n.props.testID as string | undefined)?.startsWith('batch-activity-') &&
      (n.props.accessibilityState as { checked?: boolean })?.checked
  );
  expect(checked).toHaveLength(15);
});
it('hides private content on revocation and ignores late responses after a sign-in change', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  h.request.mockImplementationOnce(async () => {
    h.version++;
    return previewData();
  });
  await review();
  expect(find('testID', 'batch-confirm')).toBeUndefined();
  expect(find('testID', `batch-activity-${activityId}`)).toBeUndefined();
});
it('storage failure retains the review and only a valid committed receipt shows success', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  await review();
  h.confirm.mockResolvedValueOnce({ kind: 'not-sent', error: new Error('disk full') });
  find('testID', 'batch-confirm').props.onPress();
  await settle();
  expect(
    find('children', 'Could not save the submission on this device. Nothing was sent.')
  ).toBeDefined();
  expect(find('testID', 'batch-confirm')).toBeDefined();
  h.confirm.mockResolvedValueOnce({
    kind: 'completed',
    result: {
      status: 'committed',
      operation: 'activities.delete',
      result: { tripId, receipt: { result: { count: 1 } } },
    },
  });
  find('testID', 'batch-confirm').props.onPress();
  await settle();
  expect(find('children', `${copy.done} · 1`)).toBeDefined();
  expect(find('testID', `batch-activity-${activityId}`)).toBeUndefined();
});
it('offline and broken journal states cannot preview or confirm', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  h.online = false;
  expect(find('testID', 'batch-review').props.disabled).toBe(true);
  h.online = true;
  h.records.isError = true;
  expect(find('testID', 'batch-review').props.disabled).toBe(true);
  find('testID', 'batch-review').props.onPress();
  await settle();
  expect(h.request.mock.calls.filter((c) => c[1].endsWith('/preview'))).toHaveLength(0);
});
it('a rejected NOT_FOUND recovered from a pending UUID restores editable selection rather than disabling the page', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  await review();
  find('testID', 'batch-confirm').props.onPress();
  await settle();
  h.records.data = [
    {
      clientRequestId: '12345678-1234-4234-8234-123456789abc',
      tripId,
      status: 'completed',
      result: { status: 'rejected', operation: 'activities.delete', code: 'NOT_FOUND' },
    },
  ];
  render();
  h.effects.at(-1)!();
  await settle();
  expect(find('testID', 'batch-review').props.disabled).toBe(false);
  expect(find('testID', `batch-activity-${activityId}`).props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(h.deny).not.toHaveBeenCalled();
});
it('restores rejected frozen IDs/revisions from the recovery list and requires explicit latest-version confirmation', async () => {
  props.source = '12345678-1234-4234-8234-123456789abc';
  h.get.mockResolvedValue({
    tripId,
    status: 'completed',
    payload: {
      operation: 'activities.delete',
      tripId,
      body: {
        dayId,
        targets: [{ activityId, expectedRevision: 4 }],
        expectedContextRevision: 'b'.repeat(64),
      },
    },
    result: { status: 'rejected', operation: 'activities.delete', code: 'CONFLICT' },
  });
  await mount();
  expect(find('testID', `batch-activity-${activityId}`).props.accessibilityState).toMatchObject({
    checked: true,
  });
  h.request.mockResolvedValueOnce(previewData({ changedIds: [activityId] }));
  await review();
  expect(find('testID', 'batch-confirm').props.disabled).toBe(true);
  expect(h.request.mock.calls.at(-1)![3].body.targets).toEqual([
    { activityId, expectedRevision: 4 },
  ]);
});
it('only a selected activity or day metadata change invalidates confirmation; unselected changes do not', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  await review();
  const live = structuredClone(data);
  live.days[0].activities[1].title = 'Unselected changed';
  h.live = live;
  expect(find('testID', 'batch-confirm').props.disabled).toBe(false);
  live.days[0].activities[0].title = 'Selected changed';
  expect(find('testID', 'batch-confirm').props.disabled).toBe(true);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('explicit cancel bypasses the unsaved selection prompt', async () => {
  await mount();
  find('testID', `batch-activity-${activityId}`).props.onPress();
  find('testID', 'batch-cancel').props.onPress();
  h.leave!({ data: { action: 'back' } });
  expect(h.alert).not.toHaveBeenCalled();
  expect(h.dispatch).toHaveBeenCalledWith('back');
});
