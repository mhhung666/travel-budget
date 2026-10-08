import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { QueueScreen } from '@/features/expenseQueue/QueueScreen';
import { OperationsScreen } from '@/features/tripEntry/OperationsScreen';
import { LocalTripsScreen, LocalDraftScreen } from '@/features/localDrafts/LocalDraftsScreen';
import { PendingSection } from '@/features/expenses/PendingSection';
import { messages } from '@/i18n/messages';
import { formatInstant, formatDate } from '@/i18n/format';
import type { QueuedExpense } from '@/storage/expenseQueue';
import type { PendingMutation } from '@/storage/mutations';
import type { PendingExpense } from '@/storage/pendingExpenses';

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  i: 0,
  j: 0,
  locale: 'en' as keyof typeof messages,
  status: 'signedIn',
  account: 'account-a',
  version: 1,
  online: true,
  visible: true,
  until: 0,
  waiting: false,
  waitFailed: false,
  waitPending: false,
  queue: [] as QueuedExpense[],
  operations: [] as PendingMutation[],
  local: [] as { tripId: string; name: string; updatedAt: number; options?: object }[],
  pending: [] as PendingExpense[],
  failed: false,
  loading: false,
  snapshotFailed: false,
  refresh: vi.fn(),
  refreshWait: vi.fn(),
  sync: vi.fn(),
  restore: vi.fn(),
  discard: vi.fn(),
  lookup: vi.fn(),
  retry: vi.fn(),
  dismiss: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  restoreLogin: vi.fn(),
  logout: vi.fn(),
  saved: vi.fn(),
  reason: vi.fn(),
  settled: vi.fn(),
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
  useRef: (value: unknown) => (h.refs[h.j++] ??= { current: value }),
}));
vi.mock('expo-router', () => ({ router: { push: h.push, replace: h.replace } }));
vi.mock('@/components/navigation', () => ({ goBack: h.back }));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage', PageHeader: 'PageHeader' }));
vi.mock('@/components/ui', () =>
  Object.fromEntries(
    ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Page', 'Section'].map((n) => [n, n])
  )
);
vi.mock('@/features/expenses/NewExpenseScreen', () => ({ LocalDraftForm: 'LocalDraftForm' }));
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
const scope = { environment: 'https://test/api/v1', accountId: 'account-a' };
const manager = {
  api: { environment: scope.environment },
  getSignInVersion: () => h.version,
  getSnapshot: () => ({ status: h.status, user: { id: h.account } }),
  restore: h.restoreLogin,
  logout: h.logout,
};
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: h.status, user: { id: h.account }, manager }),
}));
const query = (data: unknown) => ({
  data,
  dataUpdatedAt: 1,
  isPending: h.loading,
  isError: h.failed,
  isFetching: false,
  refetch: h.refresh,
});
vi.mock('@/features/expenses/entryProvider', () => ({
  useExpenseQueue: () => ({
    queue: { synchronize: h.sync, restore: h.restore, discard: h.discard },
    scope,
    records: query(h.queue),
    syncFailed: false,
  }),
  useExpenseEntry: () => ({ scope, entry: { lookup: h.lookup, retry: h.retry } }),
  usePendingExpenses: () => query(h.pending),
}));
vi.mock('@/features/tripEntry/provider', () => ({
  useTripEntry: () => ({
    scope,
    records: query(h.operations),
    entry: { lookup: h.lookup, retry: h.retry, dismiss: h.dismiss },
  }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: () => h.visible } }),
  useLocalTrips: () => ({
    ...query(h.visible ? h.local : []),
    scope,
    storageFailed: h.snapshotFailed,
  }),
}));
vi.mock('./useRecoveryDeadline', () => ({
  useRecoveryDeadline: () => ({
    until: h.until,
    now: Date.now(),
    waiting: h.waiting,
    isError: h.waitFailed,
    isPending: h.waitPending,
    isFetching: false,
    refetch: h.refreshWait,
  }),
}));

type E = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): E[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as E;
  if (typeof e.type === 'function')
    return nodes((e.type as (p: Record<string, unknown>) => ReactNode)(e.props));
  return [e, ...nodes(e.props.children as ReactNode)];
}
function render(screen: () => ReactNode) {
  h.i = 0;
  h.j = 0;
  return nodes(screen());
}
function texts(n: E[]) {
  return n
    .flatMap((e) => [e.props.children, e.props.title, e.props.value, e.props.label])
    .filter((v) => typeof v === 'string');
}
function action(n: E[], id: string) {
  const e = n.find((e) => e.props.testID === id || (e.type === 'Action' && e.props.label === id));
  expect(e).toBeTruthy();
  return e!.props as { disabled?: boolean; onPress: () => Promise<void> | void; variant?: string };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const queueRecord = (status: QueuedExpense['status'] = 'queued'): QueuedExpense => ({
  ...scope,
  tripId: 'trip',
  clientRequestId: 'uuid',
  input: {
    amountText: '1234.50',
    description: 'Private expense',
    date: '2026-10-08',
    payerId: 'member',
    memberIds: ['member'],
    category: 'food',
  },
  roster: ['member'],
  status,
  reason: null,
  nextAt: 0,
  rateLimitUntil: 0,
  createdAt: 1,
});
const operation = (status: PendingMutation['status'] = 'pending'): PendingMutation => ({
  ...scope,
  clientRequestId: 'uuid',
  operation: 'trip.create',
  payload: null,
  result:
    status === 'completed'
      ? {
          status: 'committed',
          operation: 'trip.create',
          resourceId: 'trip',
          result: { tripId: 'trip' },
        }
      : null,
  status,
  conflict: false,
  createdAt: 1,
});
const pendingRecord = (): PendingExpense => ({
  ...scope,
  clientRequestId: 'uuid',
  tripId: 'trip',
  payload: {
    client_request_id: 'uuid',
    description: 'Private expense',
    original_amount: 1234.5,
    currency: 'TWD',
    exchange_rate: 1,
    category: 'food',
    date: '2026-10-08',
    payer_id: 'member',
    splits: [{ user_id: 'member', share_amount: 1234.5 }],
  },
  status: 'unconfirmed',
  createdAt: 1,
  updatedAt: 1,
});
const pendingScreen = () =>
  PendingSection({
    records: h.pending,
    reasons: { uuid: 'network' },
    onSaved: h.saved,
    onReason: h.reason,
    onSettled: h.settled,
  });
beforeEach(() => {
  h.values = [];
  h.refs = [];
  h.i = 0;
  h.j = 0;
  h.locale = 'en';
  h.status = 'signedIn';
  h.account = scope.accountId;
  h.version = 1;
  h.online = true;
  h.visible = true;
  h.until = 0;
  h.waiting = false;
  h.waitFailed = false;
  h.waitPending = false;
  h.queue = [];
  h.operations = [];
  h.local = [];
  h.pending = [];
  h.failed = false;
  h.loading = false;
  h.snapshotFailed = false;
  vi.clearAllMocks();
  h.refresh.mockResolvedValue({});
  h.refreshWait.mockResolvedValue({});
  h.lookup.mockResolvedValue({ kind: 'pending' });
  h.retry.mockResolvedValue({ kind: 'pending' });
  h.restore.mockResolvedValue(undefined);
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'distinguishes empty, loading and failed local reads in %s',
  (locale) => {
    h.locale = locale;
    for (const [screen, empty] of [
      [QueueScreen, messages[locale].queueEmpty],
      [OperationsScreen, messages[locale].operationsEmpty],
      [LocalTripsScreen, messages[locale].localTripsEmpty],
    ] as const) {
      h.values = [];
      h.refs = [];
      expect(texts(render(screen))).toContain(empty);
      h.failed = true;
      const failed = render(screen);
      expect(texts(failed)).not.toContain(empty);
      expect(texts(failed)).toContain(
        screen === LocalTripsScreen
          ? messages[locale].draftLoadFailed
          : messages[locale].recoveryLoadFailed
      );
      action(failed, messages[locale].retry).onPress();
      expect(h.refresh).toHaveBeenCalled();
      h.failed = false;
      h.loading = true;
      expect(texts(render(screen))).toContain(messages[locale].loading);
      h.loading = false;
    }
  }
);
it.each(['queued', 'attention', 'prepared', 'resolved'] as const)(
  'only offers editable queue actions for %s',
  (status) => {
    h.queue = [queueRecord(status)];
    const n = render(QueueScreen),
      t = messages.en;
    if (status === 'prepared') {
      expect(texts(n)).toContain(t.queueUnknown);
      expect(texts(n)).toContain(t.queueFrozen);
      expect(texts(n)).not.toContain(t.queueEdit);
      expect(texts(n)).not.toContain(t.queueDiscard);
    } else if (status === 'resolved') {
      expect(texts(n)).toContain(t.queueConflict);
      expect(texts(n)).not.toContain(t.queueEdit);
      expect(action(n, t.queueDismiss).variant).toBe('ghost');
    } else {
      expect(action(n, t.queueEdit).variant).toBe('secondary');
      expect(action(n, t.queueDiscard).variant).toBe('danger');
    }
    expect(texts(n)).toContain(formatDate('2026-10-08', 'en'));
  }
);
it('requires a separate choice before replacing an existing draft', async () => {
  h.queue = [queueRecord()];
  h.restore.mockRejectedValueOnce(new Error('DRAFT_BLOCKED'));
  action(render(QueueScreen), messages.en.queueEdit).onPress();
  await flush();
  const n = render(QueueScreen);
  expect(texts(n)).toContain(messages.en.queueDraftExists);
  expect(h.push).not.toHaveBeenCalled();
  expect(action(n, messages.en.queueReplaceDraft).variant).toBe('danger');
  action(n, messages.en.queueReplaceDraft).onPress();
  await flush();
  expect(h.restore).toHaveBeenLastCalledWith(h.queue[0], true);
  expect(h.push).toHaveBeenCalledWith({ pathname: '/drafts/[id]', params: { id: 'trip' } });
});
it('keeps original UUID and suppresses double taps before render for E recovery', async () => {
  h.operations = [operation()];
  let finish!: (v: unknown) => void;
  h.lookup.mockReturnValueOnce(
    new Promise((r) => {
      finish = r;
    })
  );
  const n = render(OperationsScreen),
    check = action(n, 'mutation-check-uuid');
  check.onPress();
  check.onPress();
  expect(h.lookup).toHaveBeenCalledTimes(1);
  expect(h.lookup).toHaveBeenCalledWith(scope, 'uuid');
  finish({ kind: 'pending' });
  await flush();
  expect(texts(render(OperationsScreen))).toContain(messages.en.operationUnknown);
  expect(texts(render(OperationsScreen))).not.toContain(messages.en.recoveryRejected);
});
it('separates a confirmed completion from an unknown outcome and only dismisses completed records', async () => {
  h.operations = [operation('completed')];
  const n = render(OperationsScreen);
  expect(texts(n)).toContain(messages.en.recoveryCompleted);
  expect(texts(n)).not.toContain(messages.en.retryOriginal);
  action(n, 'mutation-open-uuid').onPress();
  expect(h.push).toHaveBeenCalledWith({ pathname: '/trips/[id]', params: { id: 'trip' } });
  action(n, messages.en.dismissOperation).onPress();
  await flush();
  expect(h.dismiss).toHaveBeenCalledWith(scope, 'uuid');
});
it('allows conflict lookup but blocks original E retries', () => {
  h.operations = [{ ...operation(), conflict: true }];
  const n = render(OperationsScreen);
  expect(action(n, 'mutation-check-uuid').disabled).toBe(false);
  expect(action(n, 'mutation-retry-uuid').disabled).toBe(true);
});
it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'shows the durable original deadline and blocks HTTP actions in %s',
  (locale) => {
    h.locale = locale;
    h.until = Date.UTC(2026, 9, 8, 3, 2, 31);
    h.waiting = true;
    h.queue = [queueRecord('prepared')];
    h.operations = [operation()];
    h.pending = [pendingRecord()];
    for (const [screen, ids] of [
      [QueueScreen, ['queue-sync']],
      [OperationsScreen, ['mutation-check-uuid', 'mutation-retry-uuid']],
      [pendingScreen, ['pending-check-0', 'pending-retry-0']],
    ] as const) {
      h.values = [];
      h.refs = [];
      const n = render(screen);
      expect(texts(n)).toContain(messages[locale].recoveryWaiting);
      expect(texts(n)).toContain(formatInstant(h.until, locale));
      for (const id of ids) expect(action(n, id).disabled).toBe(true);
    }
  }
);
it.each(['offline', 'local', 'waitFailed'] as const)(
  'disables online recovery for %s while retaining local queue',
  (condition) => {
    h.queue = [queueRecord()];
    h.operations = [operation()];
    h.pending = [pendingRecord()];
    if (condition === 'offline') h.online = false;
    else if (condition === 'local') h.status = 'local';
    else h.waitFailed = true;
    const queue = render(QueueScreen);
    expect(action(queue, 'queue-sync').disabled).toBe(true);
    expect(texts(queue)).toContain('Private expense');
    if (condition === 'waitFailed') expect(texts(queue)).toContain(messages.en.recoveryLoadFailed);
    h.values = [];
    h.refs = [];
    const pending = render(pendingScreen);
    if (condition === 'local') expect(texts(pending)).not.toContain('Private expense');
    else expect(action(pending, 'pending-check-0').disabled).toBe(true);
  }
);
it.each(['account', 'access'] as const)(
  'immediately hides private queue, pending and completed trips after %s changes',
  (condition) => {
    h.queue = [queueRecord()];
    h.pending = [pendingRecord()];
    h.operations = [operation('completed')];
    const stale = action(render(QueueScreen), messages.en.queueEdit);
    if (condition === 'account') {
      h.account = 'account-b';
      h.version++;
    } else h.visible = false;
    stale.onPress();
    expect(h.restore).not.toHaveBeenCalled();
    h.values = [];
    h.refs = [];
    expect(texts(render(QueueScreen))).not.toContain('Private expense');
    h.values = [];
    h.refs = [];
    expect(texts(render(pendingScreen))).not.toContain('Private expense');
    h.values = [];
    h.refs = [];
    expect(texts(render(OperationsScreen))).not.toContain(messages.en.openTrip);
  }
);
it('does not navigate from a late local restore after access is lost', async () => {
  h.queue = [queueRecord()];
  let finish!: () => void;
  h.restore.mockReturnValueOnce(
    new Promise<void>((r) => {
      finish = r;
    })
  );
  action(render(QueueScreen), messages.en.queueEdit).onPress();
  h.visible = false;
  finish();
  await flush();
  expect(h.push).not.toHaveBeenCalled();
});
it('only checks or retries the frozen C request and routes the known result', async () => {
  h.pending = [pendingRecord()];
  h.lookup.mockResolvedValue({ kind: 'unconfirmed', clientRequestId: 'uuid', reason: 'not-found' });
  let n = render(pendingScreen);
  expect(texts(n)).toContain(messages.en.recoveryUnknown);
  expect(texts(n)).toContain('NT$1,234.5');
  expect(texts(n)).not.toContain(messages.en.queueEdit);
  expect(texts(n)).not.toContain(messages.en.queueDiscard);
  action(n, 'pending-check-0').onPress();
  action(n, 'pending-check-0').onPress();
  await flush();
  expect(h.lookup).toHaveBeenCalledTimes(1);
  expect(h.reason).toHaveBeenCalledWith('uuid', 'not-found');
  h.retry.mockResolvedValue({ kind: 'saved', expense: { id: 'expense' } });
  n = render(pendingScreen);
  action(n, 'pending-retry-0').onPress();
  await flush();
  expect(h.retry).toHaveBeenCalledWith(scope, 'uuid');
  expect(h.saved).toHaveBeenCalled();
});
it('keeps snapshot saving failure visible and prevents forms when pending read fails', () => {
  h.local = [{ tripId: 'trip', name: 'Cached trip', updatedAt: Date.UTC(2026, 9, 8), options: {} }];
  h.snapshotFailed = true;
  expect(texts(render(LocalTripsScreen))).toContain(messages.en.localSnapshotFailed);
  h.failed = true;
  h.values = [];
  h.refs = [];
  const n = render(() => LocalDraftScreen({ tripId: 'trip' }));
  expect(n.some((e) => e.type === 'LocalDraftForm')).toBe(false);
  expect(texts(n)).toContain(messages.en.draftLoadFailed);
});
it.each(['expense.update', 'payment.create'] as const)(
  'only resumes %s after a terminal rejection, keeping its source UUID',
  (kind) => {
    const r: PendingMutation = {
      ...operation('completed'),
      tripId: 'trip',
      operation: kind,
      result: {
        status: 'rejected',
        operation: kind,
        code: kind === 'expense.update' ? 'RESOURCE_CHANGED' : 'SETTLEMENT_CHANGED',
        tripId: 'trip',
      },
      payload:
        kind === 'expense.update'
          ? {
              operation: kind,
              tripId: 'trip',
              expenseId: 'expense',
              body: {
                client_request_id: 'uuid',
                expected_revision: 'a'.repeat(64),
                mode: 'basic',
                changes: { description: 'Preserved', category: 'food', date: '2026-10-08' },
              },
            }
          : {
              operation: kind,
              tripId: 'trip',
              body: {
                client_request_id: 'uuid',
                expected_revision: 'a'.repeat(64),
                from_id: 'from',
                to_id: 'to',
                amount: 10,
                note: 'Preserved',
              },
            },
    };
    h.operations = [r];
    let n = render(OperationsScreen);
    expect(texts(n)).toContain(messages.en.recoveryRejected);
    expect(texts(n)).not.toContain(messages.en.retryOriginal);
    action(n, 'mutation-resume-uuid').onPress();
    expect(h.push).toHaveBeenCalledWith(
      kind === 'expense.update'
        ? {
            pathname: '/trips/[id]/expenses/edit',
            params: { id: 'trip', expenseId: 'expense', remove: 'false', source: 'uuid' },
          }
        : { pathname: '/trips/[id]/payments/edit', params: { id: 'trip', source: 'uuid' } }
    );
    r.result = { status: 'rejected', operation: kind, code: 'RESOURCE_GONE', tripId: 'trip' };
    n = render(OperationsScreen);
    expect(n.some((e) => e.props.testID === 'mutation-resume-uuid')).toBe(false);
  }
);

it.each(['nextAt', 'rateLimitUntil', 'account'] as const)(
  'hides the expired %s row deadline without changing the record',
  (source) => {
    const now = Date.now();
    const record = queueRecord('prepared');
    if (source === 'account') h.until = now + 120000;
    else record[source] = now + 120000;
    h.queue = [record];
    const original = structuredClone(record);
    const expected = formatInstant(now + 120000, h.locale);
    expect(texts(render(QueueScreen))).toContain(expected);
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 120000);
    try {
      expect(texts(render(QueueScreen))).not.toContain(expected);
      expect(record).toEqual(original);
      if (source === 'account') h.until = now + 240000;
      else record[source] = now + 240000;
      expect(texts(render(QueueScreen))).toContain(formatInstant(now + 240000, h.locale));
    } finally {
      spy.mockRestore();
    }
  }
);
it('keeps a future retry deadline off a resolved row', () => {
  h.queue = [
    {
      ...queueRecord('resolved'),
      nextAt: Date.now() + 120000,
      rateLimitUntil: Date.now() + 240000,
    },
  ];
  h.until = Date.now() + 360000;
  const row = render(QueueScreen).find((n) => n.props.testID === 'queue-record-0')!;
  expect(nodes(row).filter((n) => n.props.label === messages.en.queueRetryAt)).toHaveLength(0);
  expect(h.queue[0].nextAt).toBeGreaterThan(Date.now());
});
it.each(['leave', 'delete'] as const)(
  'hidden %s intent exposes only receipt lookup and no write retry or old trip navigation',
  async (kind) => {
    const record: PendingMutation = {
      ...operation(),
      tripId: 'trip',
      operation: 'trip.access',
      payload: {
        operation: 'trip.access',
        tripId: 'trip',
        body: { action: kind, client_request_id: 'uuid', expected_revision: 'a'.repeat(64) },
      },
    };
    h.operations = [record];
    h.visible = false;
    let n = render(OperationsScreen);
    expect(action(n, 'mutation-check-uuid').disabled).toBe(false);
    expect(action(n, 'mutation-retry-uuid').disabled).toBe(true);
    await action(n, 'mutation-check-uuid').onPress();
    await flush();
    expect(h.lookup).toHaveBeenCalledWith(scope, 'uuid');
    record.status = 'completed';
    record.payload = null;
    record.result = {
      status: 'committed',
      operation: 'trip.access',
      resourceId: 'trip',
      result: { tripId: 'trip', action: kind, exited: true },
    };
    n = render(OperationsScreen);
    expect(texts(n)).toContain(messages.en.operationDone);
    expect(n.some((e) => e.props.testID === 'mutation-open-uuid')).toBe(false);
    h.account = 'other';
    expect(render(OperationsScreen).some((e) => e.props.testID === 'operation-uuid')).toBe(false);
  }
);
it('hidden non-exit role/removal receipts still require membership and never display', () => {
  h.operations = [
    {
      ...operation(),
      tripId: 'trip',
      operation: 'trip.access',
      payload: {
        operation: 'trip.access',
        tripId: 'trip',
        body: {
          action: 'remove',
          member_id: 'member',
          client_request_id: 'uuid',
          expected_revision: 'a'.repeat(64),
        },
      },
    },
  ];
  h.visible = false;
  expect(render(OperationsScreen).some((e) => e.props.testID === 'operation-uuid')).toBe(false);
});
it('currency rejection resumes only the scoped currency form with original input source', () => {
  const r: PendingMutation = {
    ...scope,
    clientRequestId: 'uuid',
    operation: 'trip.currency',
    status: 'completed',
    conflict: false,
    createdAt: 1,
    tripId: 'trip',
    result: {
      status: 'rejected',
      operation: 'trip.currency',
      tripId: 'trip',
      code: 'RESOURCE_CHANGED',
    },
    payload: {
      operation: 'trip.currency',
      tripId: 'trip',
      body: {
        client_request_id: 'uuid',
        expected_revision: 'a'.repeat(64),
        settings: { default_currency: 'JPY', currencies: [{ code: 'JPY', rate: 0.2 }] },
      },
    },
  };
  h.operations = [r];
  const n = render(OperationsScreen);
  expect(texts(n)).toContain(messages.en.currencyChanged);
  action(n, 'mutation-resume-uuid').onPress();
  expect(h.push).toHaveBeenCalledWith({
    pathname: '/trips/[id]/currency-settings',
    params: { id: 'trip', source: 'uuid' },
  });
  h.visible = false;
  expect(render(OperationsScreen).some((e) => e.props.testID === 'operation-uuid')).toBe(false);
});
