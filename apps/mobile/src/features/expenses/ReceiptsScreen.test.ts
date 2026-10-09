import { beforeEach, expect, it, vi } from 'vitest';
import { ReceiptsScreen } from './ReceiptsScreen';
import { ApiError } from '@/api/client';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  i: 0,
  focus: (() => () => {}) as () => () => void,
  request: vi.fn(),
  open: vi.fn(async () => {}),
  appState: 'active',
  change: (_state: string) => {},
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
  Image: 'Image',
  ScrollView: 'ScrollView',
  Linking: { openURL: h.open },
  FlatList: 'FlatList',
  View: 'View',
  Keyboard: { dismiss: vi.fn() },
  AppState: {
    get currentState() {
      return h.appState;
    },
    addEventListener: (_event: string, fn: typeof h.change) => {
      h.change = fn;
      return { remove: vi.fn() };
    },
  },
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
    ['Action', 'Card', 'Chip', 'Copy', 'DetailRow', 'Notice', 'Section', 'TextField', 'Page'].map(
      (n) => [n, n]
    )
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

const trip = 'b'.repeat(24),
  expense = 'c'.repeat(24),
  id = 'd'.repeat(64);
const metadata = { id, contentType: 'image/png', size: 123 };
const result = { ledger: { baseCurrency: 'TWD', moneyScale: 2 }, items: [metadata] };
type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function nodes(value: ReactNode): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement(value)) return [];
  const n = value as Node;
  return [n, ...nodes(n.props.children)];
}
function render() {
  h.i = 0;
  return ReceiptsScreen({ tripId: trip, expenseId: expense });
}
function find(testID: string) {
  return nodes(render()).find((n) => n.props.testID === testID);
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.clearAllMocks();
  h.values = [];
  h.i = 0;
  h.online = true;
  h.visible = true;
  h.version = 1;
  h.access = 1;
  h.until = 0;
  h.user = 'a'.repeat(24);
  h.appState = 'active';
  h.retryAt.mockResolvedValue(0);
  h.pause.mockImplementation(async (_scope, until) => {
    h.until = Math.max(h.until, until);
  });
  h.request.mockImplementation(async (_account, path: string, _schema, options) => {
    options.beforeSend();
    return path.endsWith('/attachments')
      ? result
      : {
          ...metadata,
          ledger: result.ledger,
          url: 'https://receipts.test/file',
          expiresAt: Date.now() + 300000,
        };
  });
});
it('renders an explicit receipt opener, protects the image URL, clears on background and reloads on return', async () => {
  render();
  const blur = h.focus();
  await settle();
  (find('receipt-open-0')!.props.onPress as () => void)();
  await settle();
  expect(find('receipt-image')?.props.source).toEqual({
    uri: 'https://receipts.test/file',
    cache: 'reload',
  });
  h.appState = 'background';
  h.change('background');
  expect(find('receipt-image')).toBeUndefined();
  h.appState = 'active';
  h.change('active');
  await settle();
  expect(find('receipt-image')).toBeUndefined();
  expect(find('receipt-open-0')).toBeDefined();
  blur();
  expect(find('receipt-open-0')).toBeUndefined();
});
it('keeps the original 429 deadline and blocks another open without sending HTTP', async () => {
  render();
  h.focus();
  await settle();
  h.request.mockRejectedValueOnce(new ApiError('RATE_LIMITED', 429, 120));
  (find('receipt-open-0')!.props.onPress as () => void)();
  await settle();
  const until = h.until;
  expect(until).toBeGreaterThan(Date.now() + 119000);
  const count = h.request.mock.calls.length;
  (find('receipts-refresh')!.props.onPress as () => void)();
  await settle();
  expect(h.request).toHaveBeenCalledTimes(count);
  expect(h.until).toBe(until);
});
it('rechecks cross-trip limits after SQLite waits and hides a switched account', async () => {
  render();
  h.focus();
  await settle();
  h.retryAt.mockImplementationOnce(async () => {
    h.until = Date.now() + 120000;
  });
  (find('receipt-open-0')!.props.onPress as () => void)();
  await settle();
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(find('receipt-image')).toBeUndefined();
  h.user = 'f'.repeat(24);
  expect(find('receipt-open-0')).toBeUndefined();
});
it('does not mark an entire trip denied for a missing file, but clears on actual lost membership', async () => {
  render();
  h.focus();
  await settle();
  h.request.mockRejectedValueOnce(new ApiError('ATTACHMENT_UNAVAILABLE', 404));
  (find('receipt-open-0')!.props.onPress as () => void)();
  await settle();
  expect(h.visible).toBe(true);
  h.request.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
  (find('receipts-refresh')!.props.onPress as () => void)();
  await settle();
  expect(h.visible).toBe(false);
});
