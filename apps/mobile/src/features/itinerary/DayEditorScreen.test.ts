import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { ItineraryEditContext } from '@travel-budget/contracts';
import { messages } from '@/i18n/messages';
import { itineraryPresentationMessages } from '@/i18n/itineraryPresentationMessages';
import { itineraryMessages } from '@/i18n/itineraryMessages';
import { ApiError } from '@/api/client';
import { DayEditorScreen } from './DayEditorScreen';
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
  dayId = 'c'.repeat(24);
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
      activities: [],
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
let props: Parameters<typeof DayEditorScreen>[0];
const render = () => {
  h.i = 0;
  h.j = 0;
  h.effects = [];
  return expand(DayEditorScreen(props));
};
const find = (key: string, value: unknown) => nodes(render()).find((n) => n.props[key] === value)!;
const button = (label: string) =>
  nodes(render()).find(
    (n) => n.props.label === label && (n.props.onPress || n.props.onChangeText)
  )!;
const copy = itineraryMessages.en;
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
  props = { tripId, dayId };
});
it('edits only after explicit review, warns on unsaved leave, and uses the context revision', async () => {
  await mount();
  expect(h.prevent).toBe(false);
  button(copy.title).props.onChangeText('My title');
  render();
  expect(h.prevent).toBe(true);
  h.leave!({ data: { action: 'back' } });
  expect(h.alert).toHaveBeenCalledWith(messages.en.leaveFormTitle, copy.unsaved, expect.any(Array));
  expect(h.dispatch).not.toHaveBeenCalled();
  await review();
  expect(h.confirm).not.toHaveBeenCalled();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({ accountId: h.account }), {
    operation: 'itinerary.write',
    tripId,
    body: expect.objectContaining({
      operation: 'day.update',
      dayId,
      expected_revision: 2,
      title: 'My title',
    }),
  });
  expect(find('children', copy.saved)).toBeDefined();
  expect(h.prevent).toBe(false);
});
it('rereads and requires explicit rebase after Web edits; preserves the typed input', async () => {
  await mount();
  button(copy.title).props.onChangeText('My title');
  render();
  h.request.mockResolvedValue({
    ...data,
    days: [{ ...data.days[0], revision: 3, title: 'Web title' }],
  });
  await review();
  expect(button(copy.confirm)).toBeUndefined();
  expect(find('value', 'Web title')).toBeDefined();
  expect(button(copy.title).props.value).toBe('My title');
  button(copy.rebase).props.onPress();
  render();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    expected_revision: 3,
    title: 'My title',
  });
});
it('shows all deletion effects and requests explicit confirmation before deleting', async () => {
  props = { tripId, dayId, remove: true };
  await mount();
  await review();
  for (const [label, count] of [
    [copy.activities, '3'],
    [copy.tickets, '4'],
    [copy.expenses, '5'],
    [copy.photos, '6'],
  ])
    expect(find('label', label).props.value).toBe(count);
  expect(h.confirm).not.toHaveBeenCalled();
  button(copy.confirmDelete).props.onPress();
  await settle();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    operation: 'day.delete',
    expected_impact_revision: 'a'.repeat(64),
  });
});
it('blocks deleted days without discarding unsaved input', async () => {
  await mount();
  button(copy.title).props.onChangeText('Keep me');
  render();
  h.request.mockResolvedValue({ ...data, days: [] });
  await review();
  expect(button(copy.title).props.value).toBe('Keep me');
  expect(button(copy.rebase)).toBeUndefined();
  expect(h.confirm).not.toHaveBeenCalled();
});
it.each(['catalog', 'account', 'session'])(
  'hides private input and blocks stale actions after %s changes',
  async (source) => {
    await mount();
    const stale = button(copy.review).props.onPress;
    if (source === 'catalog') h.visible = false;
    if (source === 'account') h.account = 'd'.repeat(24);
    if (source === 'session') h.version++;
    if (source === 'account') h.version++;
    render();
    expect(find('value', 'Private notes')).toBeUndefined();
    stale();
    await settle();
    expect(h.confirm).not.toHaveBeenCalled();
  }
);
it('freezes uncertain submissions, exposes recovery, and updates when the persisted receipt arrives', async () => {
  h.confirm.mockResolvedValue({ kind: 'pending', clientRequestId: 'original' });
  await mount();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(find('children', copy.pending)).toBeDefined();
  expect(button(copy.title)).toBeUndefined();
  button(messages.en.pendingOperations).props.onPress();
  expect(h.push).toHaveBeenCalledWith('/trips/operations');
  h.records.data = [
    { clientRequestId: 'original', status: 'completed', tripId, result: { status: 'committed' } },
  ];
  render();
  expect(find('children', copy.saved)).toBeDefined();
});
it('preserves input and permits correction when the submission was not saved locally', async () => {
  h.confirm.mockResolvedValue({ kind: 'not-sent', error: new Error('disk full') });
  await mount();
  button(copy.title).props.onChangeText('Keep me');
  render();
  await review();
  button(copy.confirm).props.onPress();
  await settle();
  expect(find('children', copy.storage)).toBeDefined();
  expect(button(copy.title).props.value).toBe('Keep me');
  expect(h.prevent).toBe(true);
});
it('does not submit while offline, when pending data is unreadable, or after canceling a prepared confirmation', async () => {
  await mount();
  await review();
  const stale = button(copy.confirm).props.onPress;
  button(copy.cancelReview).props.onPress();
  render();
  stale();
  await settle();
  expect(h.confirm).not.toHaveBeenCalled();
  h.online = false;
  render();
  expect(button(copy.review).props.disabled).toBe(true);
  h.online = true;
  h.records.isError = true;
  render();
  expect(button(copy.review).props.disabled).toBe(true);
});
it('an administrator downgrade hides edit fields without treating it as membership removal', async () => {
  h.request.mockRejectedValue(new ApiError('FORBIDDEN', 403));
  await mount();
  expect(find('children', copy.admin)).toBeDefined();
  expect(button(copy.title)).toBeUndefined();
  expect(h.deny).not.toHaveBeenCalled();
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'renders %s labels with wrapping shared controls',
  async (locale) => {
    h.locale = locale;
    await mount();
    expect(find('label', itineraryPresentationMessages[locale].dayTitle)).toBeDefined();
  }
);

it('another pending trip operation does not remove the warning for this form’s unsaved input', async () => {
  await mount();
  button(copy.title).props.onChangeText('Unsaved here');
  render();
  h.records.data = [
    { tripId, status: 'pending', operation: 'expense.update', clientRequestId: 'other' },
  ];
  render();
  expect(h.prevent).toBe(true);
});
