import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { ItineraryEditContext } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { activityMessages } from '@/i18n/activityMessages';
import { ApiError } from '@/api/client';
import { ActivityEditorScreen } from './ActivityEditorScreen';
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
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField'].map((n) => [n, n])
  )
);
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
  return [n, ...nodes(n.props.children)];
}
let props: Parameters<typeof ActivityEditorScreen>[0];
const render = () => {
  h.i = 0;
  h.j = 0;
  h.effects = [];
  return expand(ActivityEditorScreen(props));
};
const find = (key: string, value: unknown) => nodes(render()).find((n) => n.props[key] === value)!;
const button = (label: string) =>
  nodes(render()).find(
    (n) => n.props.label === label && (n.props.onPress || n.props.onChangeText)
  )!;
const copy = activityMessages.en;
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  render();
}
async function mount() {
  render();
  h.effects.forEach((fn) => fn());
  await settle();
}
async function review() {
  button(copy.review).props.onPress();
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
  h.request.mockResolvedValue(structuredClone(data));
  h.confirm.mockResolvedValue({ kind: 'completed', result: { status: 'committed' } });
  props = { tripId, dayId, activityId };
});
it('edits activity fields only after explicit review and warns before leaving unsaved changes', async () => {
  await mount();
  button(copy.title).props.onChangeText('Dinner');
  button(copy.time).props.onChangeText('23:40');
  button(copy.endTime).props.onChangeText('01:20');
  render();
  expect(h.prevent).toBe(true);
  h.leave!({ data: { action: 'back' } });
  expect(h.alert).toHaveBeenCalled();
  await review();
  expect(h.confirm).not.toHaveBeenCalled();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1]).toMatchObject({
    operation: 'itinerary.write',
    tripId,
    body: {
      operation: 'activity.update',
      dayId,
      activityId,
      expected_activity_revision: 5,
      activity: { title: 'Dinner', time: '23:40', endTime: '01:20', confirmationCode: '00120' },
    },
  });
  expect(find('children', copy.saved)).toBeDefined();
});
it('adds an activity to the selected day, including a localized type choice', async () => {
  props = { tripId, dayId };
  await mount();
  button(copy.title).props.onChangeText('Museum');
  const menu = find('testID', 'itinerary-activity-type');
  (menu.props.choices as { testID: string; onPress: () => void }[])
    .find((c) => c.testID === 'itinerary-type-sightseeing')!
    .onPress();
  render();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    operation: 'activity.create',
    dayId,
    activity: { title: 'Museum', type: 'sightseeing', time: null, endTime: null },
  });
});
it('shows a concurrent Web edit in full and requires explicit rebase while retaining user input', async () => {
  await mount();
  button(copy.title).props.onChangeText('My title');
  render();
  const latest = structuredClone(data);
  Object.assign(latest.days[0].activities[0], {
    revision: 6,
    title: 'Web title',
    note: 'Web note',
    confirmationCode: 'NEW-CODE',
    endTime: '10:00',
  });
  h.request.mockResolvedValue(latest);
  await review();
  expect(button(copy.confirm)).toBeUndefined();
  for (const value of ['Web title', 'Web note', 'NEW-CODE'])
    expect(find('value', value)).toBeDefined();
  expect(
    nodes(render()).some(
      (n) => typeof n.props.value === 'string' && n.props.value.includes('10:00')
    )
  ).toBe(true);
  expect(button(copy.title).props.value).toBe('My title');
  button(copy.rebase).props.onPress();
  render();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    expected_activity_revision: 6,
    activity: { title: 'My title', note: 'Private notes' },
  });
});
it.each(['day', 'activity'])('does not recreate a missing %s after conflict', async (target) => {
  await mount();
  button(copy.title).props.onChangeText('Keep input');
  render();
  const latest = structuredClone(data);
  if (target === 'day') latest.days = [];
  else latest.days[0].activities = [];
  h.request.mockResolvedValue(latest);
  await review();
  expect(button(copy.rebase)).toBeUndefined();
  expect(button(copy.confirm)).toBeUndefined();
  expect(button(copy.title).props.value).toBe('Keep input');
  expect(h.confirm).not.toHaveBeenCalled();
});
it('reviews activity deletion and ticket effects before sending a revision-bound delete', async () => {
  props = { tripId, dayId, activityId, remove: true };
  await mount();
  await review();
  expect(find('children', copy.deleteHint)).toBeDefined();
  expect(find('value', 'Breakfast')).toBeDefined();
  expect(h.confirm).not.toHaveBeenCalled();
  button(copy.confirmDelete).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    operation: 'activity.delete',
    dayId,
    activityId,
    expected_activity_revision: 5,
  });
});
it('keeps private input and blocks repeat submission after an uncertain result, then handles a recovered rejection', async () => {
  h.confirm.mockResolvedValue({ kind: 'pending', clientRequestId: 'original' });
  await mount();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(find('children', copy.pending)).toBeDefined();
  expect(button(copy.title)).toBeUndefined();
  h.records.data = [
    {
      clientRequestId: 'original',
      status: 'completed',
      tripId,
      result: { status: 'rejected', code: 'ACTIVITY_LIMIT' },
    },
  ];
  render();
  expect(find('children', copy.limit)).toBeDefined();
  button(copy.reload).props.onPress();
  await settle();
  expect(button(copy.rebase)).toBeDefined();
  expect(button(copy.title).props.value).toBe('Breakfast');
});
it('restores the exact rejected activity form from its journal entry without sending anything', async () => {
  props = { tripId, dayId, activityId, source: 'old' };
  h.get.mockResolvedValue({
    tripId,
    status: 'completed',
    result: { status: 'rejected', code: 'CONFLICT' },
    payload: {
      operation: 'itinerary.write',
      body: {
        operation: 'activity.update',
        dayId,
        activityId,
        expected_activity_revision: 1,
        activity: { ...data.days[0].activities[0], title: 'Recovered input' },
      },
    },
  });
  await mount();
  expect(button(copy.title).props.value).toBe('Recovered input');
  expect(h.confirm).not.toHaveBeenCalled();
  expect(h.prevent).toBe(true);
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    expected_activity_revision: 5,
    activity: { title: 'Recovered input' },
  });
});
it.each(['trip', 'day', 'activity', 'mode'])(
  'does not restore a rejected payload into the wrong %s form',
  async (mismatch) => {
    props = { tripId, dayId, activityId, source: 'old' };
    h.get.mockResolvedValue({
      tripId: mismatch === 'trip' ? 'f'.repeat(24) : tripId,
      status: 'completed',
      result: { status: 'rejected', code: 'CONFLICT' },
      payload: {
        operation: 'itinerary.write',
        body: {
          operation: mismatch === 'mode' ? 'activity.delete' : 'activity.update',
          dayId: mismatch === 'day' ? 'f'.repeat(24) : dayId,
          activityId: mismatch === 'activity' ? 'f'.repeat(24) : activityId,
          expected_activity_revision: 1,
          activity: { ...data.days[0].activities[0], title: 'Wrong input' },
        },
      },
    });
    await mount();
    expect(button(copy.title).props.value).toBe('Breakfast');
  }
);
it('keeps input after a failed local save and rejects a stale confirmation after edits', async () => {
  h.confirm.mockResolvedValue({ kind: 'not-sent', error: new Error('disk full') });
  await mount();
  button(copy.title).props.onChangeText('Keep me');
  render();
  await review();
  const stale = button(copy.confirm).props.onPress;
  button(copy.title).props.onChangeText('Updated');
  render();
  stale();
  await settle();
  expect(h.confirm).not.toHaveBeenCalled();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(find('children', copy.storage)).toBeDefined();
  expect(button(copy.title).props.value).toBe('Updated');
  expect(h.prevent).toBe(true);
});
it.each(['catalog', 'session', 'account'])(
  'hides booking codes and blocks stale actions after %s changes',
  async (reason) => {
    await mount();
    const old = button(copy.review).props.onPress;
    if (reason === 'catalog') h.visible = false;
    if (reason === 'session') h.version++;
    if (reason === 'account') {
      h.account = 'e'.repeat(24);
      h.version++;
    }
    render();
    expect(find('value', '00120')).toBeUndefined();
    old();
    await settle();
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
it('hides fields on an administrator downgrade without denying the whole trip', async () => {
  h.request.mockRejectedValue(new ApiError('FORBIDDEN', 403));
  await mount();
  expect(button(copy.title)).toBeUndefined();
  expect(find('children', copy.admin)).toBeDefined();
  expect(h.deny).not.toHaveBeenCalled();
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'renders %s form labels and blocks offline review',
  async (locale) => {
    h.locale = locale;
    await mount();
    expect(find('label', activityMessages[locale].title)).toBeDefined();
    h.online = false;
    render();
    expect(find('testID', 'itinerary-activity-review').props.disabled).toBe(true);
  }
);

it('CD2 preserves the unknown legacy date until the next-day suggestion is explicitly adopted', async () => {
  const supported = {
    ...structuredClone(data),
    capabilities: { activityEndDayOffset: true as const },
  };
  supported.days[0].activities[0].time = '22:25';
  supported.days[0].activities[0].endTime = '00:20';
  h.request.mockResolvedValue(supported);
  await mount();
  const timing = (await import('@/i18n/itineraryPresentationMessages'))
    .itineraryPresentationMessages.en;
  expect(find('testID', 'activity-ends-on').props.label).toBe(timing.unconfirmed);
  expect(
    nodes(render()).some(
      (n) => typeof n.props.value === 'string' && n.props.value.includes('End date unconfirmed')
    )
  ).toBe(true);
  find('testID', 'activity-adopt-next-day').props.onPress();
  render();
  expect(find('testID', 'activity-ends-on').props.label).toBe(timing.nextDay);
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body.activity.endDayOffset).toBe(1);
});
it('CD2 blocks invalid custom dates and submits a signed date after correction', async () => {
  const supported = {
    ...structuredClone(data),
    capabilities: { activityEndDayOffset: true as const },
  };
  h.request.mockResolvedValue(supported);
  await mount();
  const timing = (await import('@/i18n/itineraryPresentationMessages'))
    .itineraryPresentationMessages.en;
  const choices = find('testID', 'activity-ends-on').props.choices as {
    testID: string;
    onPress: () => void;
  }[];
  choices.find((c) => c.testID === 'activity-end-other')!.onPress();
  render();
  button(timing.endDate).props.onChangeText('2026-02-30');
  render();
  expect(button(copy.review).props.disabled).toBe(true);
  button(copy.review).props.onPress();
  await settle();
  expect(button(copy.confirm)).toBeUndefined();
  button(timing.endDate).props.onChangeText('2026-11-02');
  render();
  expect(button(copy.review).props.disabled).toBe(false);
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body.activity.endDayOffset).toBe(-1);
});
it('CD2 retains a confirmed end date during Web revision conflicts and local save failures', async () => {
  const supported = {
    ...structuredClone(data),
    capabilities: { activityEndDayOffset: true as const },
  };
  h.request.mockResolvedValue(supported);
  await mount();
  const choices = find('testID', 'activity-ends-on').props.choices as {
    testID: string;
    onPress: () => void;
  }[];
  choices.find((c) => c.testID === 'activity-end-1')!.onPress();
  render();
  const fresh = structuredClone(supported);
  fresh.days[0].activities[0].revision++;
  h.request.mockResolvedValue(fresh);
  await review();
  expect(button(copy.confirm)).toBeUndefined();
  button(copy.rebase).props.onPress();
  render();
  await review();
  h.confirm.mockResolvedValue({ kind: 'not-sent', error: new Error('disk full') });
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body.activity.endDayOffset).toBe(1);
  expect(find('testID', 'activity-ends-on').props.label).toBe('Next day');
  expect(find('children', copy.storage)).toBeDefined();
});
it('CD2 disables new date controls without backend capability while preserving safe text edits', async () => {
  await mount();
  expect(find('testID', 'activity-ends-on')).toBeUndefined();
  expect(find('testID', 'activity-adopt-next-day')).toBeUndefined();
  expect(find('children', 'Update the server to set an end date.')).toBeDefined();
  button(copy.title).props.onChangeText('Text only');
  render();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body.activity).not.toHaveProperty('endDayOffset');
});
