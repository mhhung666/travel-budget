import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { NewExpenseScreen, LocalDraftForm } from './NewExpenseScreen';
import { SavedExpense } from './SavedExpense';
import { ExpenseBaseline } from './ExpenseBaseline';
import { Disclosure } from '@/components/Disclosure';
import { messages } from '@/i18n/messages';
import type { ExpenseOptions, ExpenseDetail } from '@/api/contracts';
import type { ExpenseDraft } from './draft';
import { createMemberLabelIndex, expenseMembers } from './rows';
import { initialPreview } from './previewState';

const h = vi.hoisted(() => ({
  locale: 'en' as keyof typeof messages,
  online: true,
  scope: { environment: 'https://test/api/v1', accountId: '1'.repeat(24) },
  slots: [] as unknown[],
  index: 0,
  refs: [] as { current: unknown }[],
  refIndex: 0,
  effects: [] as (() => void)[],
  previews: undefined as unknown,
  draft: undefined as unknown as ExpenseDraft,
  options: undefined as unknown as ExpenseOptions,
  saveStatus: 'saved' as 'saved' | 'saving' | 'failed',
  phase: 'editing',
  revision: 1,
  discardFailed: false,
  pending: [] as unknown[],
  authorized: true,
  denied: false,
  requestRates: vi.fn(),
  pause: vi.fn(),
  until: 0,
  signInVersion: 1,
  requestPreview: vi.fn(),
  submit: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
  discard: vi.fn(),
  close: vi.fn(),
  initialize: vi.fn(),
  restore: vi.fn(),
  focus: vi.fn(),
  dismiss: vi.fn(),
  refetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  refreshTripData: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refIndex++] ??= { current: initial }),
  useMemo: (factory: () => unknown) => factory(),
  useId: () => 'test-keyboard',
  useEffect: (fn: () => void) => {
    h.effects.push(fn);
  },
  useReducer: (reducer: (state: unknown, action: unknown) => unknown) => [
    h.previews,
    (action: unknown) => {
      h.previews = reducer(h.previews, action);
    },
  ],
}));
vi.mock('react-native', () => ({
  ...Object.fromEntries(
    ['Text', 'View', 'Pressable', 'ActivityIndicator', 'InputAccessoryView'].map((n) => [n, n])
  ),
  AppState: { currentState: 'active' },
  Keyboard: { dismiss: h.dismiss },
  Platform: { OS: 'ios' },
}));
vi.mock('expo-router', () => ({
  router: { push: h.push, replace: h.replace, dismissTo: h.dismissTo },
}));
vi.mock('@/components/screen', () => ({ FormPage: 'FormPage' }));
vi.mock('@/components/navigation', () => ({ goBack: vi.fn() }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', async () => {
  const { colors } = await import('@/theme/tokens');
  return {
    ...Object.fromEntries(
      [
        'Action',
        'Card',
        'Chip',
        'Copy',
        'DetailRow',
        'Metric',
        'Notice',
        'Section',
        'TextField',
        'Title',
        'Icon',
      ].map((n) => [n, n])
    ),
    usePalette: () => colors.light,
  };
});
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({
    catalog: {
      isVisible: () => !h.denied,
      captureAccess: () => () => {
        if (h.denied) throw new Error('CANCELLED');
      },
    },
  }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: h.scope.accountId } }),
}));
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/features/auth/errorMessage', () => ({
  isAccessDenied: () => h.denied,
  errorMessage: () => 'Failure',
}));
vi.mock('./entryProvider', () => ({
  useExpenseEntry: () => ({
    scope: h.scope,
    entry: { submit: h.submit },
    manager: {
      api: { environment: h.scope.environment },
      getSignInVersion: () => h.signInVersion,
      requestAs: h.requestRates,
      getSnapshot: () => ({
        status: h.online ? 'signedIn' : 'local',
        user: { id: h.scope.accountId },
      }),
    },
  }),
  usePendingExpenses: () => ({
    data: h.pending,
    isPending: false,
    isError: false,
    refetch: h.refetch,
  }),
  useExpenseQueue: () => ({ queue: { enqueue: h.enqueue } }),
}));
vi.mock('./useExpenseDraft', () => ({
  useExpenseDraft: () => ({
    editor: {
      getSnapshot: () => ({ record: { input: h.draft, revision: h.revision } }),
      edit: (input: ExpenseDraft) => {
        h.draft = input;
        h.revision++;
      },
      flush: h.flush,
      close: h.close,
      discard: h.discard,
      initialize: h.initialize,
      restore: h.restore,
    },
    state: {
      phase: h.phase,
      status: h.saveStatus,
      discardFailed: h.discardFailed,
      record: { input: h.draft },
    },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  onlineManager: { isOnline: () => h.online },
}));
vi.mock('@/storage/pendingExpenseDatabase', () => ({
  openMutationStore: async () => ({
    retryAt: async () => 0,
    rateLimitUntil: () => h.until,
    pause: h.pause,
  }),
}));
vi.mock('./entryQueries', async () => ({
  useExpenseOptions: () => ({
    data: h.options,
    authorized: h.authorized,
    isPending: false,
    refetch: h.refetch,
  }),
  useDenyExpenseOptions: () => vi.fn(),
  requestPreview: h.requestPreview,
  refreshTripData: h.refreshTripData,
}));
vi.mock('./PendingSection', () => ({ PendingSection: 'PendingSection' }));

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function call(e: Element) {
  return (e.type as (props: Record<string, unknown>) => ReactElement)(e.props);
}
function named(tree: ReactNode, name: string) {
  const e = nodes(tree).find((e) => typeof e.type === 'function' && e.type.name === name);
  if (!e) throw new Error(`Missing ${name}`);
  return e;
}
function id(tree: ReactNode, testID: string) {
  const e = nodes(tree).find((e) => e.props.testID === testID);
  if (!e) throw new Error(`Missing ${testID}`);
  return e;
}
function start() {
  h.index = h.refIndex = 0;
  h.effects = [];
}
function form(local = false) {
  start();
  const page = local
    ? LocalDraftForm({ scope: h.scope, tripId: 'trip', options: h.options })
    : call(NewExpenseScreen({ tripId: 'trip' }));
  const draftTree = call(named(page, 'DraftForm'));
  const entryTree = h.phase === 'editing' ? call(named(draftTree, 'EntryForm')) : null;
  return { page, draftTree, entryTree };
}
function press(e: Element) {
  if (!e.props.disabled) (e.props.onPress as () => void)();
}
function change(e: Element, value: string) {
  (e.props.onChangeText as (value: string) => void)(value);
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
const detail: ExpenseDetail = {
  id: 'expense',
  date: '2026-10-08',
  description: 'TEST long expense description',
  category: 'food',
  payerId: '1'.repeat(24),
  payerName: 'Same',
  amount: 100.01,
  originalAmount: 100.01,
  currency: 'TWD',
  exchangeRate: 1,
  splits: [
    { userId: '1'.repeat(24), displayName: 'Same', shareAmount: 50.01 },
    { userId: '2'.repeat(24), displayName: 'Same', shareAmount: 50 },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  h.locale = 'en';
  h.online = true;
  h.slots = [];
  h.refs = [];
  h.effects = [];
  h.previews = initialPreview;
  h.pending = [];
  h.authorized = true;
  h.denied = false;
  h.phase = 'editing';
  h.until = 0;
  h.signInVersion = 1;
  h.saveStatus = 'saved';
  h.discardFailed = false;
  h.revision = 1;
  h.options = {
    members: detail.splits.map((s) => ({ id: s.userId!, displayName: s.displayName })),
    categories: ['food', 'other'],
  };
  h.draft = {
    description: detail.description,
    amountText: '100.01',
    category: 'food',
    date: detail.date,
    payerId: h.scope.accountId,
    memberIds: detail.splits.map((s) => s.userId!),
  };
  h.refetch.mockResolvedValue({ data: h.options });
  h.requestPreview.mockResolvedValue({ amount: detail.amount, splits: detail.splits });
  h.flush.mockImplementation(async () => ({ input: h.draft }));
  h.submit.mockResolvedValue({ kind: 'not-sent' });
  h.refreshTripData.mockResolvedValue(undefined);
});
it('puts amount first, preserves raw input and moves description Next to date', () => {
  const { entryTree } = form();
  const fields = nodes(entryTree).filter((e) => e.type === 'TextField');
  expect(fields.map((e) => e.props.testID)).toEqual([
    'new-expense-amount',
    'new-expense-description',
    'new-expense-date',
  ]);
  expect(fields[0].props).toMatchObject({
    kind: 'amount',
    keyboardType: 'decimal-pad',
    inputAccessoryViewID: 'new-expense-amount-test-keyboard',
  });
  expect(fields[1].props.multiline).toBe(true);
  change(fields[0], '000100.01');
  expect(h.draft.amountText).toBe('000100.01');
  (fields[2].props.inputRef as { current: unknown }).current = { focus: h.focus };
  (fields[1].props.onSubmitEditing as () => void)();
  expect(h.focus).toHaveBeenCalledOnce();
  press(id(entryTree, 'new-expense-keyboard-done'));
  expect(h.dismiss).toHaveBeenCalledOnce();
});
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'keeps quiet saved/unsent status and complete confirmation in %s',
  async (locale) => {
    h.locale = locale;
    const status = nodes(form().draftTree).find((e) => e.props.role === 'status')!;
    expect(status.props).toMatchObject({
      accessibilityLiveRegion: 'none',
      children: messages[locale].draftSavedBrief,
    });
    press(id(form().entryTree, 'new-expense-preview'));
    await flush();
    const tree = form().entryTree;
    expect(id(tree, 'new-expense-preview').props.variant).toBe('secondary');
    const card = id(tree, 'new-expense-preview-card');
    const labels = nodes(card)
      .filter((e) => e.type === 'DetailRow')
      .map((e) => e.props.label);
    expect(labels).toContain(messages[locale].expenseDescription);
    expect(labels).toContain(messages[locale].date);
    expect(labels).toContain(messages[locale].category);
    expect(labels).toContain(messages[locale].paidBy);
    expect(id(tree, 'new-expense-split-0').props.label).toContain(messages[locale].you);
    expect(id(tree, 'new-expense-split-1').props.label).toContain('#2');
    expect(id(tree, 'new-expense-confirm').props.disabled).toBe(false);
  }
);
it('every input change invalidates confirmation and requires another preview', async () => {
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  change(id(form().entryTree, 'new-expense-description'), 'changed');
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(nodes(form().entryTree).some((e) => e.props.testID === 'new-expense-preview-card')).toBe(
    false
  );
  expect(id(form().entryTree, 'new-expense-preview').props.variant).toBe('primary');
  expect(h.submit).not.toHaveBeenCalled();
});
it('storage failure stays visible outside optional help and blocks both confirmation paths', async () => {
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  h.saveStatus = 'failed';
  const { draftTree, entryTree } = form();
  expect(
    nodes(draftTree).some(
      (e) => e.props.children === messages.en.draftSaveFailed && e.props.announce === 'polite'
    )
  ).toBe(true);
  expect(id(entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(id(entryTree, 'expense-queue-confirm').props.disabled).toBe(true);
  press(id(draftTree, 'draft-save-retry'));
  expect(h.flush).toHaveBeenCalledOnce();
});
it('keeps explicit offline rule and queue action separate from online preview', () => {
  h.online = false;
  const tree = form(true).entryTree;
  expect(id(tree, 'new-expense-preview').props.disabled).toBe(true);
  expect(id(tree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(id(tree, 'expense-queue-confirm').props).toMatchObject({
    variant: 'primary',
    label: messages.en.queueConfirm,
  });
  expect(nodes(tree).some((e) => e.props.children === messages.en.queueRule)).toBe(true);
  press(id(tree, 'expense-queue-confirm'));
  expect(h.submit).not.toHaveBeenCalled();
});
it('preserves draft restore/discard choices and their failure/retry', () => {
  h.phase = 'choice';
  h.discardFailed = true;
  const tree = form().draftTree;
  expect(nodes(tree).some((e) => e.props.children === messages.en.draftDiscardFailed)).toBe(true);
  press(id(tree, 'draft-restore'));
  expect(h.restore).toHaveBeenCalledOnce();
  press(id(tree, 'draft-discard'));
  expect(h.discard).toHaveBeenCalledOnce();
});
it('withholds the form after denial and replaces it with pending recovery', () => {
  h.denied = true;
  expect(
    nodes(call(NewExpenseScreen({ tripId: 'trip' }))).some(
      (e) => typeof e.type === 'function' && e.type.name === 'DraftForm'
    )
  ).toBe(false);
  h.denied = false;
  h.pending = [{}];
  start();
  expect(
    nodes(call(NewExpenseScreen({ tripId: 'trip' }))).some((e) => e.type === 'PendingSection')
  ).toBe(true);
});
it('optional context expands without changing values, and exposes expanded state', () => {
  start();
  let tree = Disclosure({ title: 'Help', testID: 'help', children: 'optional' });
  expect(id(tree, 'help').props.accessibilityState).toEqual({ expanded: false });
  press(id(tree, 'help'));
  start();
  tree = Disclosure({ title: 'Help', testID: 'help', children: 'optional' });
  expect(id(tree, 'help').props.accessibilityState).toEqual({ expanded: true });
  expect(nodes(tree)[0].props.children).toContain('optional');
  expect(h.submit).not.toHaveBeenCalled();
});
it('keeps foreign baseline read-only, and delete review always includes metadata', () => {
  const expense = { ...detail, originalAmount: 3000, currency: 'JPY', exchangeRate: 0.0333 };
  const tree = ExpenseBaseline({
    labels: createMemberLabelIndex(
      h.options.members,
      expenseMembers(expense),
      h.scope.accountId,
      messages[h.locale]
    ),
    expense,
    category: 'legacy-transport',
    full: true,
  });
  expect(nodes(tree).some((e) => e.props.value === 'JPY · ¥3,000')).toBe(true);
  expect(nodes(tree).some((e) => e.props.value === 'legacy-transport')).toBe(true);
  expect(nodes(tree).some((e) => e.type === 'TextField' || e.type === Disclosure)).toBe(false);
});
it('a confirmed save with failed refresh stays saved and retries only reads', async () => {
  const saved = {
    kind: 'saved' as const,
    expense: detail,
    differs: true,
    refreshed: Promise.resolve(false),
  };
  const render = () => {
    start();
    return SavedExpense({
      saved,
      tripId: 'trip',
      onAnother: vi.fn(),
      labels: createMemberLabelIndex(
        h.options.members,
        expenseMembers(saved.expense),
        h.scope.accountId,
        messages[h.locale]
      ),
    });
  };
  render();
  h.effects.forEach((fn) => fn());
  await flush();
  const tree = render();
  expect(id(tree, 'saved-amount').props.value).toBe('NT$100.01');
  expect(nodes(tree).some((e) => e.props.children === messages.en.savedHint)).toBe(true);
  expect(nodes(tree).some((e) => e.props.children === messages.en.savedRefreshFailed)).toBe(true);
  press(id(tree, 'new-expense-refresh'));
  await flush();
  expect(h.refreshTripData).toHaveBeenCalledOnce();
  expect(h.submit).not.toHaveBeenCalled();
  press(id(tree, 'new-expense-done'));
  expect(h.dismissTo).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/expenses',
    params: { id: 'trip' },
  });
});

it('keeps missing draft members until explicit removal, then requires a fresh preview', () => {
  const missing = '9'.repeat(24);
  h.draft.memberIds.push(missing);
  const tree = form().entryTree;
  expect(nodes(tree).some((e) => e.props.children === messages.en.draftMembersChanged)).toBe(true);
  expect(h.draft.memberIds).toContain(missing);
  press(id(tree, 'draft-remove-members'));
  expect(h.draft.memberIds).not.toContain(missing);
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
});

it.each(['zh', 'zh-CN', 'en', 'jp'] as const)(
  'uses one original currency code in baseline and saved output in %s',
  (locale) => {
    h.locale = locale;
    for (const currency of ['KRW', 'SGD', 'GBP']) {
      const expense = { ...detail, currency, originalAmount: 10000.25 };
      const original = ExpenseBaseline({
        expense,
        category: 'food',
        full: true,
        labels: createMemberLabelIndex(
          h.options.members,
          expenseMembers(expense),
          h.scope.accountId,
          messages[h.locale]
        ),
      });
      expect(nodes(original).some((e) => e.props.value === `${currency} 10,000.25`)).toBe(true);
      h.index = h.refIndex = 0;
      const saved = SavedExpense({
        tripId: 'trip',
        onAnother: vi.fn(),
        labels: createMemberLabelIndex(
          h.options.members,
          expenseMembers(expense),
          h.scope.accountId,
          messages[h.locale]
        ),
        saved: { kind: 'saved', expense, differs: false, refreshed: Promise.resolve(true) },
      });
      expect(nodes(saved).some((e) => e.props.value === `${currency} 10,000.25`)).toBe(true);
    }
  }
);

it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'shows full foreign confirmation and blocks the TWD queue in %s',
  async (locale) => {
    h.locale = locale;
    h.draft = {
      ...h.draft,
      currency: 'JPY',
      amountText: '000100.00',
      rateText: '0.2156789012345',
      rateSource: 'manual',
    };
    h.requestPreview.mockResolvedValue({
      amount: 21.57,
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.2156789012345,
      splits: detail.splits.map((s, index) => ({ ...s, shareAmount: index === 0 ? 10.79 : 10.78 })),
    });
    press(id(form().entryTree, 'new-expense-preview'));
    await flush();
    const tree = form().entryTree;
    expect(id(tree, 'new-expense-confirm').props.disabled).toBe(false);
    const rows = nodes(id(tree, 'new-expense-preview-card')).filter((e) => e.type === 'DetailRow');
    expect(rows.find((e) => e.props.label === messages[locale].exchangeRate)?.props.value).toBe(
      '0.2156789012345'
    );
    expect(
      rows.find((e) => e.props.label === messages[locale].originalAmount)?.props.value
    ).toContain('JPY');
    expect(id(tree, 'expense-queue-confirm').props.disabled).toBe(true);
    (id(tree, 'expense-queue-confirm').props.onPress as () => void)();
    await flush();
    expect(h.enqueue).not.toHaveBeenCalled();
    change(id(tree, 'new-expense-rate'), '0.216');
    expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  }
);
it('currency switches preserve original digits and use the selected pinned rate without reapplying settings', () => {
  h.draft = { ...h.draft, amountText: '000100.01' };
  h.options = {
    ...h.options,
    currencySettings: {
      default_currency: 'JPY',
      currencies: [
        { code: 'JPY', rate: 0.2156789012345 },
        { code: 'USD', rate: null },
      ],
    },
  };
  press(id(form().entryTree, 'new-expense-currency-JPY'));
  expect(h.draft).toMatchObject({
    amountText: '000100.01',
    currency: 'JPY',
    rateText: '0.2156789012345',
  });
  h.options.currencySettings!.currencies[0].rate = 9;
  expect(id(form().entryTree, 'new-expense-rate').props.value).toBe('0.2156789012345');
  press(id(form().entryTree, 'new-expense-currency-USD'));
  expect(h.draft).toMatchObject({ amountText: '000100.01', currency: 'USD', rateText: '' });
  expect(h.requestPreview).not.toHaveBeenCalled();
});
it('reference rates require explicit read and apply; failures and missing quotes retain manual input', async () => {
  h.draft = { ...h.draft, currency: 'JPY', rateText: '0.2156789012345', rateSource: 'manual' };
  form();
  expect(h.requestRates).not.toHaveBeenCalled();
  h.requestRates.mockResolvedValueOnce({
    rates: { TWD: 1, JPY: 0.216789012345 },
    dates: { JPY: '2026-10-07' },
    provider: 'Frankfurter',
  });
  press(id(form().entryTree, 'new-expense-load-rates'));
  await flush();
  expect(h.draft.rateText).toBe('0.2156789012345');
  expect(nodes(form().entryTree).some((e) => e.props.value === '2026-10-07')).toBe(true);
  press(id(form().entryTree, 'new-expense-use-rate'));
  expect(h.draft).toMatchObject({
    rateText: '0.216789012345',
    rateSource: 'reference',
    rateDate: '2026-10-07',
  });
  h.requestRates.mockRejectedValueOnce(new Error('offline'));
  press(id(form().entryTree, 'new-expense-load-rates'));
  await flush();
  expect(h.draft.rateText).toBe('0.216789012345');
  expect(nodes(form().entryTree).some((e) => e.props.testID === 'new-expense-use-rate')).toBe(
    false
  );
  h.requestRates.mockResolvedValueOnce({ rates: { TWD: 1 }, dates: {}, provider: 'Frankfurter' });
  press(id(form().entryTree, 'new-expense-load-rates'));
  await flush();
  expect(
    nodes(form().entryTree).some((e) => e.props.children === messages.en.rateUnavailable)
  ).toBe(true);
  expect(h.draft.rateText).toBe('0.216789012345');
});
it.each(['edit', 'account', 'denial', 'offline'] as const)(
  'does not expose late reference response after %s',
  async (mode) => {
    h.draft = { ...h.draft, currency: 'JPY', rateText: '0.215' };
    let finish!: (v: unknown) => void;
    h.requestRates.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    press(id(form().entryTree, 'new-expense-load-rates'));
    await flush();
    if (mode === 'edit') change(id(form().entryTree, 'new-expense-rate'), '0.214');
    if (mode === 'account') h.signInVersion++;
    if (mode === 'denial') h.denied = true;
    if (mode === 'offline') h.online = false;
    finish({ rates: { TWD: 1, JPY: 0.22 }, dates: { JPY: '2026-10-07' }, provider: 'Frankfurter' });
    await flush();
    // Inspect the form directly for denial; the outer screen additionally hides it.
    if (!h.denied)
      expect(nodes(form().entryTree).some((e) => e.props.testID === 'new-expense-use-rate')).toBe(
        false
      );
    expect(h.draft.rateText).toBe(mode === 'edit' ? '0.214' : '0.215');
  }
);
it('stores reference-read 429 as an account wait and prevents another upstream request', async () => {
  const { ApiError } = await import('@/api/client');
  h.draft = { ...h.draft, currency: 'JPY', rateText: '0.215' };
  h.pause.mockImplementation(async (_scope, until) => {
    h.until = until;
  });
  h.requestRates.mockRejectedValueOnce(new ApiError('BUSY', 429, 120));
  press(id(form().entryTree, 'new-expense-load-rates'));
  await flush();
  expect(h.pause).toHaveBeenCalledWith(h.scope, expect.any(Number));
  press(id(form().entryTree, 'new-expense-load-rates'));
  await flush();
  expect(h.requestRates).toHaveBeenCalledOnce();
});

function splitForm() {
  return call(named(form().entryTree, 'SplitFields'));
}
function advancedOptions() {
  h.options = {
    ...h.options,
    ledger: { baseCurrency: 'TWD', moneyScale: 2 },
    splitPreviewModes: ['equal', 'amount', 'percent', 'shares'],
    splitCreateModes: ['equal', 'amount', 'percent', 'shares'],
  };
  h.refetch.mockImplementation(async () => ({ data: h.options }));
}
function advancedPreview(mode = 'shares') {
  return {
    ...detail,
    ledger: { baseCurrency: 'TWD', moneyScale: 2 },
    splitMode: mode,
    splits: detail.splits.map((s) => ({ ...s, originalShareAmount: s.shareAmount })),
  };
}
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'offers all modes and ID-labelled raw inputs in %s, preserving each mode and deselected text',
  (locale) => {
    h.locale = locale;
    advancedOptions();
    const who = h.scope.accountId;
    const peer = '2'.repeat(24);
    press(id(splitForm(), 'expense-split-mode-amount'));
    change(id(splitForm(), `expense-split-value-${who}`), '00020.');
    expect(id(splitForm(), `expense-split-value-${who}`).props.label).toContain(
      messages[locale].you
    );
    expect(id(splitForm(), `expense-split-value-${peer}`).props.label).toContain('#2');
    expect(id(splitForm(), `expense-split-value-${who}`).props).toMatchObject({
      keyboardType: 'decimal-pad',
      inputAccessoryViewID: 'new-expense-amount-test-keyboard',
    });
    press(id(splitForm(), 'expense-split-mode-percent'));
    expect(id(splitForm(), `expense-split-value-${who}`).props.value).toBe('');
    change(id(splitForm(), `expense-split-value-${who}`), '33.33');
    press(id(splitForm(), 'expense-split-mode-shares'));
    change(id(splitForm(), `expense-split-value-${who}`), '0');
    press(id(form().entryTree, `new-expense-member-${who}`));
    expect(nodes(splitForm()).some((e) => e.props.testID === `expense-split-value-${who}`)).toBe(
      false
    );
    press(id(form().entryTree, `new-expense-member-${who}`));
    expect(id(splitForm(), `expense-split-value-${who}`).props.value).toBe('0');
    press(id(splitForm(), 'expense-split-mode-amount'));
    expect(id(splitForm(), `expense-split-value-${who}`).props.value).toBe('00020.');
    expect(h.draft.splitValues).toEqual({
      amount: { [who]: '00020.' },
      percent: { [who]: '33.33' },
      shares: { [who]: '0' },
    });
    press(id(splitForm(), 'expense-split-mode-equal'));
    expect(nodes(splitForm()).some((e) => e.type === 'TextField')).toBe(false);
  }
);
it('keeps advanced drafts editable offline or on an older backend, with neither send path available', () => {
  press(id(splitForm(), 'expense-split-mode-shares'));
  expect(id(form().entryTree, 'new-expense-preview').props.disabled).toBe(true);
  expect(id(form().entryTree, 'expense-queue-confirm').props.disabled).toBe(true);
  press(id(form().entryTree, 'expense-queue-confirm'));
  h.online = false;
  expect(id(form(true).entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(h.requestPreview).not.toHaveBeenCalled();
});
it('confirms mode and both per-person units, freezing the split only after saving the draft', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-shares'));
  h.requestPreview.mockResolvedValue(advancedPreview());
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(h.requestPreview.mock.calls[0][3]).toMatchObject({
    split: { mode: 'shares', values: [null, null] },
  });
  const tree = form().entryTree;
  expect(id(tree, 'new-expense-confirm').props.disabled).toBe(false);
  expect(id(tree, 'new-expense-original-split-0').props.value).toContain('50.01');
  expect(
    nodes(tree).some(
      (e) => e.props.label === messages.en.splitMode && e.props.value === messages.en.splitShares
    )
  ).toBe(true);
  press(id(tree, 'new-expense-confirm'));
  await flush();
  expect(h.flush).toHaveBeenCalledOnce();
  expect(h.submit.mock.calls[0][2]).toMatchObject({
    split: { mode: 'shares', values: [null, null] },
  });
});
it('cancels advanced previews after mode, value, members, amount, currency or rate changes, including late replies', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-shares'));
  let resolve!: (v: unknown) => void;
  h.requestPreview.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  change(id(splitForm(), `expense-split-value-${h.scope.accountId}`), '2');
  resolve(advancedPreview());
  await flush();
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  h.requestPreview.mockResolvedValue(advancedPreview());
  for (const edit of [
    () => press(id(splitForm(), 'expense-split-mode-amount')),
    () => change(id(splitForm(), `expense-split-value-${h.scope.accountId}`), '20'),
    () => press(id(form().entryTree, `new-expense-member-${h.scope.accountId}`)),
    () => change(id(form().entryTree, 'new-expense-amount'), '101'),
    () => press(id(form().entryTree, 'new-expense-currency-JPY')),
    () => change(id(form().entryTree, 'new-expense-rate'), '0.21'),
  ]) {
    h.options.currencySettings = {
      default_currency: 'TWD',
      currencies: [{ code: 'JPY', rate: 0.215 }],
    };
    press(id(form().entryTree, 'new-expense-preview'));
    await flush();
    edit();
    expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  }
  expect(h.submit).not.toHaveBeenCalled();
});

it('rechecks write capability after refresh without degrading a restored advanced draft', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-percent'));
  change(id(splitForm(), `expense-split-value-${h.scope.accountId}`), '033.33');
  h.refetch.mockResolvedValue({ data: { ...h.options, splitCreateModes: undefined } });
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(h.requestPreview).not.toHaveBeenCalled();
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(h.draft.splitValues?.percent?.[h.scope.accountId]).toBe('033.33');
});
it('rejects a legacy/mismatched preview for an explicit split before enabling confirmation', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-shares'));
  h.requestPreview.mockResolvedValue({ ...advancedPreview(), splitMode: undefined });
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
  expect(nodes(form().entryTree).some((e) => e.props.testID === 'new-expense-preview-card')).toBe(
    false
  );
  expect(h.submit).not.toHaveBeenCalled();
});
it('all-zero and malformed advanced input never reaches preview or the queue', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-shares'));
  for (const member of h.options.members)
    change(id(splitForm(), `expense-split-value-${member.id}`), '0');
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(h.requestPreview).not.toHaveBeenCalled();
  change(id(splitForm(), `expense-split-value-${h.scope.accountId}`), '12abc');
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(id(splitForm(), `expense-split-value-${h.scope.accountId}`).props.error).toBe(
    messages.en.splitInvalid
  );
  expect(h.requestPreview).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
});

it('does not freeze values that changed while waiting for the draft flush', async () => {
  advancedOptions();
  press(id(splitForm(), 'expense-split-mode-shares'));
  h.requestPreview.mockResolvedValue(advancedPreview());
  press(id(form().entryTree, 'new-expense-preview'));
  await flush();
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(false);
  h.flush.mockResolvedValue({
    input: { ...h.draft, splitValues: { shares: { [h.scope.accountId]: '2' } } },
  });
  press(id(form().entryTree, 'new-expense-confirm'));
  await flush();
  expect(h.submit).not.toHaveBeenCalled();
  expect(id(form().entryTree, 'new-expense-confirm').props.disabled).toBe(true);
});
