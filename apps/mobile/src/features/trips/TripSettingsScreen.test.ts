import { beforeEach, expect, it, vi } from 'vitest';
import { TripSettingsScreen } from './TripSettingsScreen';
import { ApiError } from '@/api/client';
import type { TripSettings } from '@travel-budget/contracts';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  effects: [] as (() => (() => void) | void)[],
  request: vi.fn(),
  confirm: vi.fn(),
  get: vi.fn(),
  pause: vi.fn(),
  refresh: vi.fn(),
  prevent: vi.fn(),
  online: true,
  visible: true,
  version: 1,
  access: 1,
  until: 0,
  user: 'a'.repeat(24),
  environment: 'https://test/api/v1',
  connection: (() => {}) as (online: boolean) => void,
  background: (() => {}) as (state: string) => void,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.i++;
    if (!(i in h.values)) h.values[i] = initial;
    return [
      h.values[i],
      (v: unknown) => {
        h.values[i] = typeof v === 'function' ? v(h.values[i]) : v;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.j++] ??= { current: initial }),
  useEffect: (fn: () => (() => void) | void) => h.effects.push(fn),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Keyboard: { dismiss: vi.fn() },
  TextInput: 'TextInput',
  AppState: {
    currentState: 'active',
    addEventListener: (_name: string, fn: typeof h.background) => {
      h.background = fn;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() },
  useNavigation: () => ({ dispatch: vi.fn() }),
}));
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: h.prevent }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField'].map((n) => [n, n])
  )
);
vi.mock('@/i18n/useMessages', () => ({
  useMessages: () => new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  onlineManager: {
    isOnline: () => h.online,
    subscribe: (fn: typeof h.connection) => {
      h.connection = fn;
      return vi.fn();
    },
  },
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope: { environment: h.environment, accountId: 'a'.repeat(24) },
    entry: { confirm: h.confirm },
    manager: {
      api: { baseUrl: h.environment },
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
    retryAt: async () => h.until,
    rateLimitUntil: () => h.until,
    get: h.get,
    pause: h.pause,
  }),
}));
vi.mock('./managementRefresh', () => ({ refreshManagedTrip: h.refresh }));
const tripId = 'b'.repeat(24);
const original: TripSettings = {
  tripId,
  name: 'Original',
  description: 'Original note',
  startDate: null,
  endDate: null,
  destination: null,
  role: 'admin',
  archived: false,
  revision: 'c'.repeat(64),
  archiveRevision: 'd'.repeat(64),
};
interface Props {
  testID?: string;
  label?: string;
  value?: string;
  children?: unknown;
  editable?: boolean;
  disabled?: boolean;
  onPress?: () => unknown;
  onChangeText?: (value: string) => void;
  inputRef?: { current: unknown };
  onSubmitEditing?: () => void;
}
function render(source?: string) {
  h.i = h.j = 0;
  return TripSettingsScreen({ tripId, source });
}
function nodes(node: unknown): { props: Props }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as { props: Props };
  return [item, ...nodes(item.props.children)];
}
function find(id: string) {
  const found = nodes(render()).find((n) => n.props.testID === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found.props;
}
function edit(key: string, value: string) {
  find(`settings-${key}`).onChangeText!(value);
}
async function flush() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
async function mount(source?: string) {
  render(source);
  const cleanup = h.effects[0]();
  await flush();
  return cleanup;
}
beforeEach(() => {
  vi.resetAllMocks();
  h.values = [];
  h.refs = [];
  h.effects = [];
  h.i = h.j = 0;
  h.online = h.visible = true;
  h.version = h.access = 1;
  h.until = 0;
  h.user = 'a'.repeat(24);
  h.request.mockImplementation(async (_actor, _path, _schema, options) => {
    options?.beforeSend?.();
    return original;
  });
  h.confirm.mockResolvedValue({
    kind: 'completed',
    result: {
      status: 'committed',
      operation: 'trip.update',
      resourceId: tripId,
      result: { tripId, revision: 'e'.repeat(64) },
    },
  });
});
it('load, review and confirm use a fresh revision; edits invalidate prepared confirmation', async () => {
  await mount();
  edit('name', 'User name');
  await find('settings-review').onPress!();
  await flush();
  expect(find('settings-confirm').disabled).toBe(false);
  edit('description', 'User note');
  expect(nodes(render()).some((n) => n.props.testID === 'settings-confirm')).toBe(false);
  await find('settings-review').onPress!();
  await flush();
  await find('settings-confirm').onPress!();
  await flush();
  expect(h.confirm).toHaveBeenCalledWith(
    { environment: h.environment, accountId: 'a'.repeat(24) },
    {
      operation: 'trip.update',
      tripId,
      body: {
        expected_revision: original.revision,
        changes: { name: 'User name', description: 'User note' },
      },
    }
  );
});
it('Web conflicts require review and rebase keeps only user changes', async () => {
  await mount();
  edit('description', 'User note');
  h.request.mockResolvedValue({ ...original, name: 'Web name', revision: 'f'.repeat(64) });
  await find('settings-review').onPress!();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(find('settings-description').value).toBe('User note');
  find('settings-reconfirm').onPress!();
  expect(find('settings-name').value).toBe('Web name');
  expect(find('settings-description').value).toBe('User note');
  await find('settings-review').onPress!();
  await flush();
  await find('settings-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.calls[0][1].body.changes).toEqual({ description: 'User note' });
});
it('ordinary members can archive but cannot edit the trip', async () => {
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await mount();
  expect(nodes(render()).some((n) => n.props.testID === 'settings-name')).toBe(false);
  await find('settings-archive').onPress!();
  await flush();
  await find('settings-confirm').onPress!();
  await flush();
  expect(h.confirm.mock.calls[0][1]).toEqual({
    operation: 'trip.archive',
    tripId,
    body: { expected_revision: original.archiveRevision, archived: true },
  });
});
it('archive is disabled with unsaved edits so success cannot silently discard them', async () => {
  await mount();
  edit('name', 'Unsaved');
  expect(find('settings-archive').disabled).toBe(true);
});
it.each(['offline', 'background'])('%s clears prepared confirmation', async (kind) => {
  await mount();
  edit('name', 'User');
  await find('settings-review').onPress!();
  await flush();
  if (kind === 'offline') {
    h.online = false;
    h.connection(false);
  } else h.background('background');
  expect(nodes(render()).some((n) => n.props.testID === 'settings-confirm')).toBe(false);
});
it('unknown result locks edits and routes to original operation recovery', async () => {
  await mount();
  edit('name', 'User');
  await find('settings-review').onPress!();
  await flush();
  h.confirm.mockResolvedValueOnce({ kind: 'pending' });
  await find('settings-confirm').onPress!();
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'settings-name')).toBe(false);
  expect(h.prevent.mock.calls.at(-1)?.[0]).toBe(false);
});
it('storage failure keeps input editable for retry', async () => {
  await mount();
  edit('name', 'User');
  await find('settings-review').onPress!();
  await flush();
  h.confirm.mockResolvedValueOnce({ kind: 'not-sent' });
  await find('settings-confirm').onPress!();
  await flush();
  expect(find('settings-name')).toMatchObject({ value: 'User', editable: true });
});
it('keyboard next moves through fields and failed validation never sends', async () => {
  await mount();
  const focus = vi.fn();
  find('settings-description').inputRef!.current = { focus };
  find('settings-name').onSubmitEditing!();
  expect(focus).toHaveBeenCalledOnce();
  edit('start', '2026-02-30');
  await find('settings-review').onPress!();
  await flush();
  expect(h.confirm).not.toHaveBeenCalled();
  expect(h.request).toHaveBeenCalledOnce();
});
it('role demotion during prepare retains input but removes admin editing after review', async () => {
  await mount();
  edit('name', 'User');
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await find('settings-review').onPress!();
  await flush();
  find('settings-reconfirm').onPress!();
  expect(nodes(render()).some((n) => n.props.testID === 'settings-name')).toBe(false);
  expect(h.confirm).not.toHaveBeenCalled();
});
it('429 from context is persisted as an account-wide deadline', async () => {
  h.request.mockRejectedValue(new ApiError('RATE_LIMITED', 429, 120));
  await mount();
  expect(h.pause).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: 'a'.repeat(24) }),
    expect.any(Number)
  );
});
it('a late context after unmount cannot populate fields', async () => {
  let resolve!: (value: TripSettings) => void;
  h.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const cleanup = await mount();
  cleanup?.();
  resolve(original);
  await flush();
  expect(nodes(render()).some((n) => n.props.testID === 'settings-name')).toBe(false);
});
it('known revocation hides settings and skips new requests', async () => {
  await mount();
  h.visible = false;
  const calls = h.request.mock.calls.length;
  expect(nodes(render()).some((n) => n.props.testID === 'settings-name')).toBe(false);
  expect(h.request).toHaveBeenCalledTimes(calls);
});

it('lost admin edits can be explicitly discarded to unlock personal archive', async () => {
  await mount();
  edit('name', 'User');
  h.request.mockResolvedValue({ ...original, role: 'member' });
  await find('settings-review').onPress!();
  await flush();
  find('settings-reconfirm').onPress!();
  expect(find('settings-archive').disabled).toBe(true);
  find('settings-discard-changes').onPress!();
  expect(find('settings-archive').disabled).toBe(false);
});
