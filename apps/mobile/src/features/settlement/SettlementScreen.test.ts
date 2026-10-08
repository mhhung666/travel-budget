import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { Settlement } from '@/api/contracts';
import { messages } from '@/i18n/messages';
import { formatDate, localDate, money } from '@/i18n/format';
import { SettlementScreen } from './SettlementScreen';

const h = vi.hoisted(() => ({
  locale: 'en' as keyof typeof messages,
  online: true,
  visible: true,
  user: { id: 'a'.repeat(24) } as { id: string } | null,
  push: vi.fn(),
  query: {
    data: undefined as Settlement | undefined,
    error: undefined as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock('@/features/expenses/useTripMembers', () => ({
  useTripMembers: () => ({
    roster: [
      { id: a, displayName: 'Same' },
      { id: b, displayName: 'Same' },
    ],
    denied: false,
  }),
}));
vi.mock('react-native', () =>
  Object.fromEntries(['Text', 'View', 'ActivityIndicator'].map((n) => [n, n]))
);
vi.mock('expo-router', () => ({ router: { push: h.push } }));
vi.mock('@/features/navigation/TripContext', () => ({ TripContext: 'TripContext' }));
vi.mock('@/components/ui', async () => {
  const { colors } = await import('@/theme/tokens');
  return {
    ...Object.fromEntries(
      ['Action', 'Badge', 'Card', 'Copy', 'Metric', 'Notice', 'Page', 'Section', 'Title'].map(
        (n) => [n, n]
      )
    ),
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
vi.mock('./queries', () => ({ useSettlement: () => h.query }));

type Element = ReactElement<Record<string, unknown>>;
// Execute this screen's local view functions; native adapters remain mocked.
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const e = node as Element;
  if (typeof e.type === 'function')
    return nodes((e.type as (props: unknown) => ReactNode)(e.props));
  return [e, ...nodes(e.props.children as ReactNode)];
}
function texts(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(texts).join('');
  if (!isValidElement(node)) return '';
  const e = node as Element;
  return typeof e.type === 'function'
    ? texts((e.type as (props: unknown) => ReactNode)(e.props))
    : texts(e.props.children as ReactNode);
}
const render = () => SettlementScreen({ tripId: 'trip' });
function find(testID: string, tree = render()) {
  const found = nodes(tree).find((n) => n.props.testID === testID);
  if (!found) throw new Error(`Missing ${testID}`);
  return found;
}
const [a, b, c] = ['a', 'b', 'c'].map((n) => n.repeat(24));
const transfer = (fromId: string, toId: string, amount: number) => ({
  fromId,
  toId,
  fromName: 'Same',
  toName: 'Same',
  amount,
});
const original: Settlement = {
  status: 'outstanding',
  totalExpenses: 1000.01,
  balances: [
    { userId: a, displayName: 'Same', balance: -20.01, totalPaid: 0, totalOwed: 20.01 },
    { userId: b, displayName: 'Same', balance: 20.01, totalPaid: 100, totalOwed: 79.99 },
  ],
  suggestedTransfers: [transfer(b, c, 2), transfer(a, b, 20.01)],
  payments: [
    {
      id: 'payment',
      fromId: null,
      fromName: '',
      toId: b,
      toName: 'Same',
      amount: 5.01,
      note: 'actually paid',
      createdAt: '2026-10-07T12:00:00.000Z',
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  h.locale = 'en';
  h.online = h.visible = true;
  h.user = { id: a };
  Object.assign(h.query, {
    data: original,
    error: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
  });
});
it.each(Object.keys(messages) as (keyof typeof messages)[])(
  'localizes amount/date and keeps complete same-name/removed-party labels: %s',
  (locale) => {
    h.locale = locale;
    const tree = render(),
      t = messages[locale];
    expect(find('settlement-my-balance', tree).props).toMatchObject({
      label: t.payable,
      value: money(20.01, locale),
    });
    expect(texts(find('settlement-transfer-0', tree))).toContain(
      `Same · #${a.slice(-6)} · ${t.you} → Same · #${b.slice(-6)}`
    );
    expect(texts(find('settlement-payment-payment', tree))).toContain(
      `${t.removedMember} → Same · #${b.slice(-6)}`
    );
    expect(texts(find('settlement-payment-payment', tree))).toContain(
      formatDate(localDate(new Date(original.payments[0].createdAt)), locale)
    );
    expect(texts(find(`settlement-balance-${a}`, tree))).toContain(
      `Same · #${a.slice(-6)} · ${t.you}`
    );
    expect(
      nodes(tree).some(
        (n) => n.props.numberOfLines !== undefined || n.props.allowFontScaling === false
      )
    ).toBe(false);
  }
);
it('orders own balance, suggestions, recorded payments, all balances and total; navigation never writes', () => {
  const tree = render(),
    list = nodes(tree);
  const index = (id: string) => list.findIndex((n) => n.props.testID === id);
  expect(index('settlement-my-balance')).toBeLessThan(index('settlement-transfer-0'));
  expect(index('settlement-transfer-0')).toBeLessThan(index('settlement-payment-payment'));
  expect(index('settlement-payment-payment')).toBeLessThan(index(`settlement-balance-${a}`));
  expect(index(`settlement-balance-${a}`)).toBeLessThan(index('settlement-total'));
  const record = nodes(find('settlement-transfer-0', tree)).find(
    (n) => n.props.testID === 'settlement-record-payment'
  )!;
  (record.props.onPress as () => void)();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/payments/edit',
    params: { id: 'trip', from: a, to: b, amount: '20.01' },
  });
  (find('payment-revoke-payment', tree).props.onPress as () => void)();
  expect(find('payment-revoke-payment', tree).props.variant).toBe('danger');
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/payments/edit',
    params: { id: 'trip', paymentId: 'payment' },
  });
  (find('settlement-manual-payment', tree).props.onPress as () => void)();
  expect(h.push).toHaveBeenLastCalledWith({
    pathname: '/trips/[id]/payments/edit',
    params: { id: 'trip' },
  });
});
it.each(['empty', 'settled', 'outstanding'] as const)(
  'uses backend %s status independently of zero own balance and missing suggestions',
  (status) => {
    h.query.data = {
      ...original,
      status,
      suggestedTransfers: [],
      balances: [{ ...original.balances[0], balance: 0 }],
      payments: status === 'empty' ? [] : original.payments,
    };
    const t = messages.en;
    expect(texts(find('settlement-status'))).toBe(
      status === 'empty'
        ? t.settlementEmpty
        : status === 'settled'
          ? t.settlementSettled
          : t.settlementOutstanding
    );
    expect(find('settlement-my-balance').props.label).toBe(t.balanced);
    expect(texts(render())).toContain(t.noSuggestedTransfers);
    expect(texts(render())).toContain(status === 'empty' ? t.noPayments : 'actually paid');
  }
);
it('does not invent a personal balance for a viewer absent from backend balances', () => {
  h.user = { id: c };
  expect(nodes(render()).some((n) => n.props.testID === 'settlement-my-balance')).toBe(false);
});
it.each(['catalog', 'HTTP', 'signed out'])(
  'hides cached private ledger and every action after %s denial',
  (source) => {
    if (source === 'catalog') h.visible = false;
    if (source === 'HTTP') {
      h.query.error = 'denied';
      h.query.isError = true;
    }
    if (source === 'signed out') h.user = null;
    expect(
      nodes(render()).some((n) =>
        [
          'settlement-total',
          'settlement-my-balance',
          'settlement-transfer-0',
          'payment-revoke-payment',
        ].includes(n.props.testID as string)
      )
    ).toBe(false);
    expect(texts(render())).not.toContain('actually paid');
  }
);
it('offline stale data remains readable with disabled write entrances and readonly refresh', () => {
  h.online = false;
  h.query.isError = true;
  h.query.error = 'network';
  const tree = render();
  expect(texts(tree)).toContain(messages.en.staleData);
  expect(find('settlement-total', tree)).toBeDefined();
  const actions = nodes(tree).filter(
    (n) =>
      n.props.testID === 'settlement-record-payment' ||
      n.props.testID === 'settlement-manual-payment' ||
      n.props.testID === 'payment-revoke-payment'
  );
  expect(actions.length).toBe(4);
  expect(actions.every((n) => n.props.disabled === true)).toBe(true);
  expect(find('settlement-refresh', tree).props.disabled).toBe(true);
});
it('loading, initial failure and refresh keep their existing read-only controls', () => {
  h.query.data = undefined;
  h.query.isPending = true;
  expect(nodes(render()).some((n) => n.type === 'ActivityIndicator')).toBe(true);
  h.query.isPending = false;
  h.query.isError = true;
  h.query.error = 'network';
  expect(texts(render())).toContain('Failure');
  (find('settlement-retry').props.onPress as () => void)();
  expect(h.query.refetch).toHaveBeenCalledOnce();
  h.query.data = original;
  h.query.isError = false;
  (find('settlement-refresh').props.onPress as () => void)();
  expect(h.query.refetch).toHaveBeenCalledTimes(2);
});

it.each(['USD', 'JPY'] as const)('B3 settlement and payments preserve %s cents', (base) => {
  h.query.data = {
    ...original,
    ledger: { baseCurrency: base, moneyScale: 2 as const },
    totalExpenses: 0.01,
  };
  const tree = render();
  expect(find('settlement-total', tree).props.value).toBe(
    `${base} · ${base === 'JPY' ? '¥' : '$'}0.01`
  );
  expect(texts(tree)).toContain(`${base} ·`);
  expect(texts(tree)).not.toContain('NT$');
});
