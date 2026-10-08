import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { Expense, ExpenseDetail } from '@/api/contracts';
import { messages } from '@/i18n/messages';
import { money, formatDate } from '@/i18n/format';
import { createMemberLabelIndex } from './rows';
import { ExpenseRow } from './ExpenseRow';
import { ExpensesScreen } from './ExpensesScreen';
import { ExpenseDetailScreen } from './ExpenseDetailScreen';

const h = vi.hoisted(() => ({
  locale: 'en' as keyof typeof messages,
  online: true,
  visible: true,
  user: { id: '0123456789abcdef01a1b2c3' } as { id: string } | null,
  push: vi.fn(),
  dismissTo: vi.fn(),
  refresh: vi.fn(),
  pending: [] as unknown[],
  roster: [] as { id: string; displayName: string }[] | undefined,
  membersDenied: false,
  membersFetching: false,
  memberRetry: vi.fn(),
  query: {
    data: undefined as { pages: { items: Expense[] }[] } | undefined,
    error: undefined as unknown,
    isPending: false,
    isError: false,
    isRefetching: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  },
  detail: {
    data: undefined as ExpenseDetail | undefined,
    error: undefined as unknown,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock('./useTripMembers', () => ({
  useTripMembers: () => ({
    roster: h.roster,
    denied: h.membersDenied,
    canRead: true,
    isFetching: h.membersFetching,
    refresh: () => {
      if (h.user && h.visible) return h.memberRetry();
    },
    refetch: h.memberRetry,
  }),
}));
vi.mock('react-native', () =>
  Object.fromEntries(
    ['ActivityIndicator', 'FlatList', 'Pressable', 'RefreshControl', 'Text', 'View'].map((n) => [
      n,
      n,
    ])
  )
);
vi.mock('expo-router', () => ({ router: { push: h.push, dismissTo: h.dismissTo } }));
vi.mock('@/components/frame', () => ({ ScreenFrame: 'ScreenFrame' }));
vi.mock('@/components/screen', () => ({ PageHeader: 'PageHeader' }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', async () => {
  const { colors } = await import('@/theme/tokens');
  return {
    ...Object.fromEntries(
      ['Action', 'Card', 'Copy', 'DetailRow', 'Notice', 'Page', 'Section', 'Title'].map((n) => [
        n,
        n,
      ])
    ),
    styles: { page: {} },
    usePalette: () => colors.light,
  };
});
vi.mock('@/i18n/useMessages', async () => {
  const { messages } = await import('@/i18n/messages');
  return { useMessages: () => messages[h.locale], useAppLocale: () => h.locale };
});
vi.mock('@/providers/useOnline', () => ({ useOnline: () => h.online }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: h.user, manager: { api: { baseUrl: 'https://test/api/v1' } } }),
}));
vi.mock('@/features/localDrafts/provider', () => ({
  useDraftCatalog: () => ({ catalog: { isVisible: () => h.visible } }),
}));
vi.mock('@/features/auth/errorMessage', () => ({
  isAccessDenied: (error: unknown) => error === 'denied',
  errorMessage: () => 'Failure',
}));
vi.mock('./queries', () => ({
  useExpenses: () => ({ query: h.query, refresh: h.refresh }),
  useExpense: () => h.detail,
}));
vi.mock('./entryProvider', () => ({ usePendingExpenses: () => ({ data: h.pending }) }));
type Element = ReactElement<Record<string, unknown>>;
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children as ReactNode)];
}
function find(node: ReactNode, testID: string) {
  const found = nodes(node).find((e) => e.props.testID === testID);
  if (!found) throw new Error(`Missing ${testID}`);
  return found;
}
function press(e: Element) {
  (e.props.onPress as () => void)();
}
const expense: ExpenseDetail = {
  id: 'fx',
  date: '2026-10-07',
  description: 'Very long TEST description '.repeat(10),
  category: 'food',
  payerId: '0123456789abcdef01b9c0d1',
  payerName: 'Same',
  payerIsVirtual: true,
  amount: 99.9,
  originalAmount: 3000,
  currency: 'JPY',
  exchangeRate: 0.0333,
  splits: [
    { userId: '0123456789abcdef01a1b2c3', displayName: 'Same', shareAmount: 10 },
    { userId: '0123456789abcdef01b9c0d1', displayName: 'Same', shareAmount: 89.9, isVirtual: true },
    { userId: null, displayName: '', shareAmount: 0 },
  ],
};
const detail = () => ExpenseDetailScreen({ tripId: 'trip', expenseId: 'fx' });
const list = () => nodes(ExpensesScreen({ tripId: 'trip' })).find((e) => e.type === 'FlatList')!;
beforeEach(() => {
  vi.clearAllMocks();
  h.locale = 'en';
  h.online = true;
  h.visible = true;
  h.user = { id: '0123456789abcdef01a1b2c3' };
  h.pending = [];
  h.membersDenied = false;
  h.membersFetching = false;
  h.roster = [
    { id: '0123456789abcdef01a1b2c3', displayName: 'Same' },
    { id: '0123456789abcdef01b9c0d1', displayName: 'Same' },
  ];
  Object.assign(h.query, {
    data: { pages: [{ items: [expense] }] },
    error: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  Object.assign(h.detail, {
    data: expense,
    error: undefined,
    isError: false,
    isPending: false,
    isFetching: false,
  });
});
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'shows the same localized currency/date in list and detail: %s',
  (locale) => {
    h.locale = locale;
    const row = ExpenseRow({
      expense,
      tripId: 'trip',
      labels: createMemberLabelIndex(h.roster, [], h.user?.id, messages[locale]),
    });
    expect(row.props.accessibilityLabel).toContain(formatDate(expense.date, locale));
    expect(row.props.accessibilityLabel).toContain(money(99.9, locale));
    expect(row.props.accessibilityLabel).toContain('JPY · ¥3,000');
    expect(row.props.accessibilityLabel).toContain(messages[locale].categoryFood);
    expect(row.props.accessibilityLabel).toContain(messages[locale].virtualMember);
    expect(
      nodes(row).some(
        (e) => e.props.numberOfLines !== undefined || e.props.allowFontScaling === false
      )
    ).toBe(false);
    const tree = detail();
    expect(find(tree, 'expense-date').props.value).toBe(formatDate(expense.date, locale));
    expect(find(tree, 'expense-amount').props.value).toBe(money(99.9, locale));
    expect(find(tree, 'expense-original').props.value).toBe('JPY · ¥3,000');
    expect(find(tree, 'expense-rate').props.value).toBe('0.0333');
    expect(find(tree, 'expense-split-0').props).toMatchObject({
      label: `Same · #a1b2c3 · ${messages[locale].you}`,
      value: 'NT$10',
    });
    expect(find(tree, 'expense-split-1').props.label).toBe(
      `Same · #b9c0d1 · ${messages[locale].virtualMember}`
    );
    expect(find(tree, 'expense-split-2').props).toMatchObject({
      label: messages[locale].removedMember,
      value: 'NT$0',
    });
  }
);
it('opens only the existing detail/edit/delete flows, with delete styled as danger', () => {
  press(
    ExpenseRow({
      expense,
      tripId: 'trip',
      labels: createMemberLabelIndex(h.roster, [], h.user?.id, messages[h.locale]),
    })
  );
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/expenses/[expenseId]',
    params: { id: 'trip', expenseId: 'fx' },
  });
  const tree = detail();
  expect(find(tree, 'expense-edit').props.variant).toBe('secondary');
  expect(find(tree, 'expense-delete').props.variant).toBe('danger');
  press(find(tree, 'expense-delete'));
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/expenses/edit',
    params: { id: 'trip', expenseId: 'fx', remove: 'true' },
  });
  press(find(tree, 'expense-refresh'));
  expect(h.detail.refetch).toHaveBeenCalledOnce();
});
it.each(['catalog', 'http', 'account'])(
  'hides cached rows, amounts, member identities and mutation controls after %s denial',
  (source) => {
    if (source === 'catalog') h.visible = false;
    if (source === 'http') {
      h.query.error = h.detail.error = 'denied';
      h.query.isError = h.detail.isError = true;
    }
    if (source === 'account') h.user = null;
    h.query.hasNextPage = true;
    const tree = detail();
    expect(
      nodes(tree).some((e) =>
        ['expense-amount', 'expense-payer', 'expense-edit', 'expense-delete'].includes(
          String(e.props.testID)
        )
      )
    ).toBe(false);
    expect(list().props.data).toEqual([]);
    expect(list().props.ListFooterComponent).toBeNull();
  }
);
it('retains pagination, refresh, pending review and the row IDs', () => {
  h.query.data!.pages.push({ items: [expense, { ...expense, id: 'older' }] });
  h.pending = [{}];
  h.query.hasNextPage = true;
  const tree = list();
  expect((tree.props.data as Expense[]).map((e) => e.id)).toEqual(['fx', 'older']);
  ((tree.props.refreshControl as Element).props.onRefresh as () => void)();
  press(tree.props.ListFooterComponent as Element);
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.memberRetry).toHaveBeenCalledOnce();
  expect(h.query.fetchNextPage).toHaveBeenCalledOnce();
  const add = find(tree.props.ListHeaderComponent as ReactNode, 'expenses-add');
  expect(add.props.label).toBe(messages.en.reviewPending);
  press(add);
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/expenses/new',
    params: { id: 'trip' },
  });
});
it('keeps cached reading offline but disables editing/deleting and page requests', () => {
  h.online = false;
  h.query.hasNextPage = true;
  expect(find(detail(), 'expense-edit').props.disabled).toBe(true);
  expect(find(detail(), 'expense-delete').props.disabled).toBe(true);
  const tree = list();
  expect((tree.props.ListFooterComponent as Element).props.disabled).toBe(true);
  ((tree.props.refreshControl as Element).props.onRefresh as () => void)();
  expect(h.refresh).not.toHaveBeenCalled();
  expect(h.memberRetry).not.toHaveBeenCalled();
});
it('keeps authorized stale data with a warning and retry', () => {
  h.detail.isError = h.query.isError = true;
  h.detail.error = h.query.error = 'network';
  expect(find(detail(), 'expense-amount').props.value).toBe('NT$99.9');
  expect(nodes(detail()).some((e) => e.props.children === messages.en.staleData)).toBe(true);
  press(find(detail(), 'expense-retry'));
  expect(h.detail.refetch).toHaveBeenCalledOnce();
  expect((list().props.data as Expense[]).length).toBe(1);
});
it('distinguishes initial loading/error/empty and does not invent shares or attachments', () => {
  h.query.data = undefined;
  h.query.isPending = true;
  expect((list().props.ListEmptyComponent as Element).type).toBe('ActivityIndicator');
  h.query.isPending = false;
  h.query.isError = true;
  expect(list().props.ListEmptyComponent).toBeNull();
  h.query.isError = false;
  expect(list().props.ListEmptyComponent).not.toBeNull();
  h.detail.data = { ...expense, splits: [], currency: 'TWD', payerId: null, payerName: '' };
  expect(nodes(detail()).some((e) => e.props.children === messages.en.noSplits)).toBe(true);
  expect(find(detail(), 'expense-payer').props.value).toBe(messages.en.removedMember);
  expect(nodes(detail()).some((e) => e.props.testID === 'expense-original')).toBe(false);
});

it('keeps a payer identity fixed when later pages add a same-name suffix collision', () => {
  const first = { ...expense, payerId: '0123456789abcdef01b9c0d1' };
  h.roster = [
    { id: first.payerId, displayName: 'Same' },
    { id: '0123456789abcdef02b9c0d1', displayName: 'Same' },
  ];
  h.query.data = { pages: [{ items: [first] }] };
  const row = (item: ExpenseDetail) => {
    const element = (
      list().props.renderItem as (p: {
        item: ExpenseDetail;
      }) => ReactElement<Parameters<typeof ExpenseRow>[0]>
    )({ item });
    return ExpenseRow(element.props);
  };
  const before = nodes(row(first)).find((n) => typeof n.props.accessibilityLabel === 'string')!
    .props.accessibilityLabel;
  expect(before).toContain('Same · #1b9c0d1');
  expect(before).not.toContain(first.payerId);
  h.query.data.pages.push({
    items: [{ ...first, id: 'second', payerId: '0123456789abcdef02b9c0d1' }],
  });
  expect(
    nodes(row(first)).find((n) => typeof n.props.accessibilityLabel === 'string')!.props
      .accessibilityLabel
  ).toBe(before);
  h.detail.data = first;
  expect(find(detail(), 'expense-payer').props.value).toBe(
    `Same · #1b9c0d1 · ${messages.en.virtualMember}`
  );
});
it.each(['KRW', 'SGD', 'GBP'])('uses one currency code in list and detail for %s', (currency) => {
  const foreign = { ...expense, currency, originalAmount: 10000.25 };
  h.detail.data = foreign;
  const row = ExpenseRow({
    expense: foreign,
    tripId: 'trip',
    labels: createMemberLabelIndex(h.roster, [], h.user?.id, messages[h.locale]),
  });
  expect(row.props.accessibilityLabel).toContain(`${currency} 10,000.25`);
  expect(row.props.accessibilityLabel).not.toContain(`${currency} · ${currency}`);
  expect(find(detail(), 'expense-original').props.value).toBe(`${currency} 10,000.25`);
});

it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'keeps unique names and IDs out of the row accessibility label in %s',
  (locale) => {
    h.locale = locale;
    const id = '0123456789abcdef01a1b2c3';
    h.roster = [{ id, displayName: 'Alice' }];
    const single = { ...expense, payerId: id, payerName: 'Alice', payerIsVirtual: true };
    const row = ExpenseRow({
      expense: single,
      tripId: 'trip',
      labels: createMemberLabelIndex(h.roster, [], id, messages[locale]),
    });
    expect(row.props.accessibilityLabel).toContain(
      `Alice · ${messages[locale].you} · ${messages[locale].virtualMember}`
    );
    expect(row.props.accessibilityLabel).not.toContain(id);
    expect(row.props.accessibilityLabel).not.toContain('#');
    h.detail.data = single;
    expect(find(detail(), 'expense-payer').props.value).toBe(
      `Alice · ${messages[locale].you} · ${messages[locale].virtualMember}`
    );
  }
);
it('keeps a current unique name unchanged while disambiguating newly visible historical references', () => {
  const a = '0123456789abcdef01a1b2c3',
    b = '0123456789abcdef01b9c0d1',
    c = '0123456789abcdef02b9c0d1';
  h.roster = [{ id: a, displayName: 'Alice' }];
  const first = { ...expense, payerId: a, payerName: 'Alice', payerIsVirtual: false };
  const second = { ...first, id: 'historical-1', payerId: b };
  const third = { ...first, id: 'historical-2', payerId: c };
  h.query.data = { pages: [{ items: [first, second] }] };
  const row = (item: Expense) => {
    const e = (
      list().props.renderItem as (p: {
        item: Expense;
      }) => ReactElement<Parameters<typeof ExpenseRow>[0]>
    )({ item });
    return ExpenseRow(e.props);
  };
  const before = row(first).props.accessibilityLabel;
  expect(row(second).props.accessibilityLabel).toContain('Alice · #b9c0d1');
  h.query.data.pages.push({ items: [third] });
  expect(row(first).props.accessibilityLabel).toBe(before);
  expect(row(second).props.accessibilityLabel).toContain('Alice · #1b9c0d1');
  expect(row(third).props.accessibilityLabel).toContain('Alice · #2b9c0d1');
  for (const item of [first, second, third])
    expect(row(item).props.accessibilityLabel).not.toContain(item.payerId);
});
it('withholds ledger labels when the shared roster read denies access', () => {
  h.membersDenied = true;
  expect(list().props.data).toEqual([]);
  expect(nodes(detail()).some((n) => n.props.testID === 'expense-payer')).toBe(false);
  const notice = nodes(detail()).find((n) => typeof n.type === 'function' && n.props.members)!;
  const rendered = (notice.type as (p: typeof notice.props) => ReactNode)(notice.props);
  const retry = find(rendered, 'member-roster-retry');
  press(retry);
  expect(h.memberRetry).toHaveBeenCalledOnce();
  h.online = false;
  const offline = nodes(detail()).find((n) => typeof n.type === 'function' && n.props.members)!;
  expect(
    find(
      (offline.type as (p: typeof offline.props) => ReactNode)(offline.props),
      'member-roster-retry'
    ).props.disabled
  ).toBe(true);
});

it.each(['pending', 'offline', 'network failure'])(
  'keeps names uncoded in list and detail with no roster during %s',
  (source) => {
    h.roster = undefined;
    h.online = source !== 'offline';
    h.membersFetching = source === 'pending';
    const item = { ...expense, payerName: 'Alice' };
    h.query.data = { pages: [{ items: [item] }] };
    h.detail.data = item;
    const row = (
      list().props.renderItem as (p: {
        item: Expense;
      }) => ReactElement<Parameters<typeof ExpenseRow>[0]>
    )({ item });
    const label = ExpenseRow(row.props).props.accessibilityLabel;
    expect(label).toContain(`Alice · ${messages.en.virtualMember}`);
    expect(label).not.toContain('#');
    expect(label).not.toContain(item.payerId);
    expect(find(detail(), 'expense-payer').props.value).toBe(
      `Alice · ${messages.en.virtualMember}`
    );
    h.roster = [{ id: item.payerId!, displayName: 'Alice' }];
    const loaded = (
      list().props.renderItem as (p: {
        item: Expense;
      }) => ReactElement<Parameters<typeof ExpenseRow>[0]>
    )({ item });
    expect(ExpenseRow(loaded.props).props.accessibilityLabel).toBe(label);
  }
);
it('refreshes roster with expenses and uses the updated roster for a new member', () => {
  const item = { ...expense, payerName: 'Bob', payerIsVirtual: false };
  h.roster = [{ id: h.user!.id, displayName: 'Alice' }];
  h.query.data = { pages: [{ items: [item] }] };
  const label = () => {
    const row = (
      list().props.renderItem as (p: {
        item: Expense;
      }) => ReactElement<Parameters<typeof ExpenseRow>[0]>
    )({ item });
    return ExpenseRow(row.props).props.accessibilityLabel;
  };
  expect(label()).toContain('Bob · #b9c0d1');
  h.memberRetry.mockImplementationOnce(() => {
    h.roster = [
      { id: h.user!.id, displayName: 'Alice' },
      { id: item.payerId!, displayName: 'Bob' },
    ];
  });
  ((list().props.refreshControl as Element).props.onRefresh as () => void)();
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.memberRetry).toHaveBeenCalledOnce();
  expect(label()).toContain('Bob');
  expect(label()).not.toContain('#');
  h.membersFetching = true;
  expect((list().props.refreshControl as Element).props.refreshing).toBe(true);
});
it('retries expenses and roster together from the error block', () => {
  h.query.isError = true;
  h.query.error = 'network';
  press(find(list().props.ListHeaderComponent as ReactNode, 'expenses-retry'));
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.memberRetry).toHaveBeenCalledOnce();
  expect(h.query.refetch).not.toHaveBeenCalled();
  h.membersFetching = true;
  expect(find(list().props.ListHeaderComponent as ReactNode, 'expenses-retry').props.disabled).toBe(
    true
  );
});
it('does not request hidden trip roster on pull-to-refresh or expense retry', () => {
  h.visible = false;
  const tree = list();
  ((tree.props.refreshControl as Element).props.onRefresh as () => void)();
  expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.memberRetry).not.toHaveBeenCalled();
  h.query.isError = true;
  press(find(list().props.ListHeaderComponent as ReactNode, 'expenses-retry'));
  expect(h.refresh).toHaveBeenCalledTimes(2);
  expect(h.memberRetry).not.toHaveBeenCalled();
});
