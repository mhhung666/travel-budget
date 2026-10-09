// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const names = [
    'mobileMaintainExpense',
    'mobileEditContext',
    'mobileExpenseOptions',
    'mobileExpensePreview',
    'mobileExpenses',
    'mobileExpense',
    'mobileCreateExpense',
    'mobileExpenseRequest',
    'mobileTripMembers',
    'mobileManageMember',
    'mobilePaymentContext',
    'mobileWritePayment',
    'mobileSettlement',
    'mobileTripAccess',
    'mobileManageTripAccess',
    'mobileMemberClaimInvitation',
    'mobileEnterTrip',
    'mobileMutationRequest',
    'mobileInvitation',
    'mobileManageTrip',
    'mobileTripCurrency',
    'mobileExpenseSearch',
    'mobileReceipts',
    'mobileBudget',
    'mobileSetBudget',
    'mobileTripSettings',
    'mobileTrips',
    'mobileLanding',
  ] as const;
  return {
    service: Object.fromEntries(names.map((name) => [name, vi.fn()])) as Record<
      (typeof names)[number],
      ReturnType<typeof vi.fn>
    >,
    user: vi.fn(),
    after: vi.fn(),
  };
});
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/mobile/session', () => ({ requireMobileUser: mocks.user }));
vi.mock('@/lib/mobile/expenseMaintenance', () => mocks.service);
vi.mock('@/lib/mobile/expenseOptions', () => mocks.service);
vi.mock('@/lib/mobile/expenses', () => mocks.service);
vi.mock('@/lib/mobile/expenseWrite', () => mocks.service);
vi.mock('@/lib/mobile/members', () => mocks.service);
vi.mock('@/lib/mobile/payments', () => mocks.service);
vi.mock('@/lib/mobile/settlement', () => mocks.service);
vi.mock('@/lib/mobile/tripAccess', () => mocks.service);
vi.mock('@/lib/mobile/tripEntry', () => mocks.service);
vi.mock('@/lib/mobile/tripManagement', () => mocks.service);
vi.mock('@/lib/mobile/receipts', () => mocks.service);
vi.mock('@/lib/mobile/expenseSearch', () => mocks.service);
vi.mock('@/lib/mobile/budget', () => mocks.service);
vi.mock('@/lib/mobile/trips', () => ({
  ...mocks.service,
  viewerDate: (url: URL) => url.searchParams.get('today'),
}));
import { inLedgerContext } from '@/lib/ledger';
import { mobileOperation, type MobileOperation } from '@/lib/mobile/operations';

const ids = {
  id: '507f191e810c19729de860ea',
  expenseId: '507f191e810c19729de860eb',
  attachmentId: 'a'.repeat(64),
  memberId: '507f191e810c19729de860ec',
  paymentId: '507f191e810c19729de860ed',
  clientRequestId: 'c6a3f8f2-6a1d-4a59-9f41-1d2b8b9f0e10',
  uuid: 'd3b07384-d9a0-4c9b-8f3e-2d7b6c4a1e22',
};
const userId = '507f191e810c19729de86000';
const url = 'https://example.test/api/v2/x?today=2026-10-08';
const req = (method = 'GET') => new Request(url, { method });
const { id, expenseId, memberId, paymentId, clientRequestId, uuid } = ids;
const anyRequest = expect.any(Request);
const anyUrl = expect.any(URL);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: userId });
  for (const fn of Object.values(mocks.service)) fn.mockResolvedValue({ ok: true });
});

// Every member operation and the exact service call it must make; a swapped id or mode fails here.
const table: [MobileOperation, keyof typeof mocks.service, unknown[]][] = [
  ['expense.receipts', 'mobileReceipts', [userId, id, expenseId]],
  ['expense.receiptView', 'mobileReceipts', [userId, id, expenseId, ids.attachmentId]],
  ['expense.search', 'mobileExpenseSearch', [userId, id, anyUrl]],
  ['budget.context', 'mobileBudget', [userId, id]],
  ['budget.set', 'mobileSetBudget', [anyRequest, userId, id]],
  ['trip.list', 'mobileTrips', [userId, anyUrl]],
  ['trip.create', 'mobileEnterTrip', [anyRequest, userId, 'trip.create']],
  ['trip.join', 'mobileEnterTrip', [anyRequest, userId, 'trip.join']],
  ['mutation.request', 'mobileMutationRequest', [userId, uuid]],
  ['trip.landing', 'mobileLanding', [userId, id, '2026-10-08']],
  ['trip.invitation', 'mobileInvitation', [userId, id]],
  ['trip.settings', 'mobileTripSettings', [userId, id]],
  ['trip.update', 'mobileManageTrip', [anyRequest, userId, id, 'trip.update']],
  ['trip.archive', 'mobileManageTrip', [anyRequest, userId, id, 'trip.archive']],
  ['trip.currencyContext', 'mobileTripCurrency', [userId, id]],
  ['trip.currency', 'mobileManageTrip', [anyRequest, userId, id, 'trip.currency']],
  ['access.context', 'mobileTripAccess', [userId, id]],
  ['access.manage', 'mobileManageTripAccess', [anyRequest, userId, id]],
  ['member.list', 'mobileTripMembers', [userId, id]],
  ['member.create', 'mobileManageMember', [anyRequest, userId, id]],
  ['member.update', 'mobileManageMember', [anyRequest, userId, id, memberId]],
  ['member.claimInvitation', 'mobileMemberClaimInvitation', [userId, id, memberId]],
  ['expense.options', 'mobileExpenseOptions', [userId, id]],
  ['expense.preview', 'mobileExpensePreview', [anyRequest, userId, id]],
  ['expense.list', 'mobileExpenses', [userId, id, anyUrl]],
  ['expense.create', 'mobileCreateExpense', [anyRequest, userId, id, expect.any(Function)]],
  ['expense.request', 'mobileExpenseRequest', [userId, id, clientRequestId]],
  ['expense.detail', 'mobileExpense', [userId, id, expenseId]],
  ['expense.editContext', 'mobileEditContext', [userId, id, expenseId]],
  [
    'expense.update',
    'mobileMaintainExpense',
    [anyRequest, userId, id, expenseId, 'expense.update'],
  ],
  [
    'expense.delete',
    'mobileMaintainExpense',
    [anyRequest, userId, id, expenseId, 'expense.delete'],
  ],
  ['settlement.read', 'mobileSettlement', [userId, id]],
  ['payment.context', 'mobilePaymentContext', [userId, id]],
  ['payment.revokeContext', 'mobilePaymentContext', [userId, id, paymentId]],
  ['payment.create', 'mobileWritePayment', [anyRequest, userId, id]],
  ['payment.revoke', 'mobileWritePayment', [anyRequest, userId, id, paymentId]],
];

describe('shared member operations', () => {
  it.each(table)('%s calls %s with the route ids', async (operation, service, args) => {
    await expect(mobileOperation(operation, req(), Promise.resolve(ids) as never)).resolves.toEqual(
      { ok: true }
    );
    const called = Object.entries(mocks.service).filter(([, fn]) => fn.mock.calls.length);
    expect(called.map(([name]) => name)).toEqual([service]);
    expect(mocks.service[service].mock.calls[0]).toEqual(args);
  });

  it('authenticates before touching params or services', async () => {
    mocks.user.mockRejectedValue(new Error('unauthorized'));
    const params = { then: vi.fn() };
    await expect(mobileOperation('expense.update', req(), params as never)).rejects.toThrow(
      'unauthorized'
    );
    expect(params.then).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('defers expense delivery with after()', async () => {
    await mobileOperation('expense.create', req(), Promise.resolve(ids) as never);
    const schedule = mocks.service.mobileCreateExpense.mock.calls[0][3] as (t: () => void) => void;
    const task = () => undefined;
    schedule(task);
    expect(mocks.after).toHaveBeenCalledWith(task);
  });
});

// Route level: each v2 member route runs its named operation inside the ledger v2 wrapper.
const api = join(process.cwd(), 'src/app/api');
const routeFiles = (version: string) =>
  readdirSync(join(api, version), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts'))
    .filter((file) => !/^(auth|me|capabilities)\/|\/exchange-rates\//.test(file))
    .sort();
const methods = ['GET', 'POST', 'PATCH', 'DELETE'] as const;
const routes: Record<string, Partial<Record<(typeof methods)[number], MobileOperation>>> = {
  'mutation-requests/[uuid]/route.ts': { GET: 'mutation.request' },
  'trips/[id]/access/route.ts': { GET: 'access.context', POST: 'access.manage' },
  'trips/[id]/archive/route.ts': { POST: 'trip.archive' },
  'trips/[id]/expense-search/route.ts': { GET: 'expense.search' },
  'trips/[id]/budget/route.ts': { GET: 'budget.context', POST: 'budget.set' },
  'trips/[id]/currency-settings/route.ts': { GET: 'trip.currencyContext', POST: 'trip.currency' },
  'trips/[id]/expense-options/route.ts': { GET: 'expense.options' },
  'trips/[id]/expense-requests/[clientRequestId]/route.ts': { GET: 'expense.request' },
  'trips/[id]/expenses/[expenseId]/attachments/route.ts': { GET: 'expense.receipts' },
  'trips/[id]/expenses/[expenseId]/attachments/[attachmentId]/route.ts': {
    GET: 'expense.receiptView',
  },
  'trips/[id]/expenses/[expenseId]/edit-context/route.ts': { GET: 'expense.editContext' },
  'trips/[id]/expenses/[expenseId]/route.ts': {
    GET: 'expense.detail',
    PATCH: 'expense.update',
    DELETE: 'expense.delete',
  },
  'trips/[id]/expenses/preview/route.ts': { POST: 'expense.preview' },
  'trips/[id]/expenses/route.ts': { GET: 'expense.list', POST: 'expense.create' },
  'trips/[id]/invitation/route.ts': { GET: 'trip.invitation' },
  'trips/[id]/landing/route.ts': { GET: 'trip.landing' },
  'trips/[id]/members/[memberId]/claim-invitation/route.ts': { GET: 'member.claimInvitation' },
  'trips/[id]/members/[memberId]/route.ts': { PATCH: 'member.update' },
  'trips/[id]/members/route.ts': { GET: 'member.list', POST: 'member.create' },
  'trips/[id]/payment-context/route.ts': { GET: 'payment.context' },
  'trips/[id]/payments/[paymentId]/revoke-context/route.ts': { GET: 'payment.revokeContext' },
  'trips/[id]/payments/[paymentId]/route.ts': { DELETE: 'payment.revoke' },
  'trips/[id]/payments/route.ts': { POST: 'payment.create' },
  'trips/[id]/route.ts': { PATCH: 'trip.update' },
  'trips/[id]/settings/route.ts': { GET: 'trip.settings' },
  'trips/[id]/settlement/route.ts': { GET: 'settlement.read' },
  'trips/join/route.ts': { POST: 'trip.join' },
  'trips/route.ts': { GET: 'trip.list', POST: 'trip.create' },
};

describe('v2 member routes', () => {
  it('covers exactly the 28 member routes and every operation once; no v1 family remains', () => {
    expect(existsSync(join(api, 'v1'))).toBe(false);
    expect(routeFiles('v2')).toEqual(Object.keys(routes).sort());
    const operations = Object.values(routes).flatMap((route) => Object.values(route));
    expect(operations.sort()).toEqual(table.map(([operation]) => operation).sort());
  });

  it.each(Object.entries(routes))(
    '%s dispatches its operations under ledger v2',
    async (file, map) => {
      const route = await import(join(api, 'v2', file));
      expect(methods.filter((method) => method in route)).toEqual(
        methods.filter((method) => method in map)
      );
      for (const [method, operation] of Object.entries(map)) {
        const [, service, args] = table.find(([name]) => name === operation)!;
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: userId });
        const runs: { v2: boolean; service: string }[] = [];
        for (const [name, fn] of Object.entries(mocks.service))
          fn.mockImplementation(async () => {
            runs.push({ v2: inLedgerContext(), service: name });
            return { ok: true };
          });
        const response: Response = await route[method](req(method), {
          params: Promise.resolve(ids),
        });
        // The stub is not a v2 DTO, so the declared schema must reject it.
        expect(response.status).toBe(503);
        expect(runs).toEqual([{ v2: true, service }]);
        expect(mocks.service[service].mock.calls[0]).toEqual(
          args.map((arg) => (arg === anyRequest ? expect.objectContaining({ method }) : arg))
        );
      }
    }
  );
});
