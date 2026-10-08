// @vitest-environment node
import { readdirSync } from 'node:fs';
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
vi.mock('@/lib/mobile/trips', () => ({
  ...mocks.service,
  viewerDate: (url: URL) => url.searchParams.get('today'),
}));
import { isLedgerV2 } from '@/lib/ledger';
import { mobileOperation, type MobileOperation } from '@/lib/mobile/operations';

const ids = {
  id: '507f191e810c19729de860ea',
  expenseId: '507f191e810c19729de860eb',
  memberId: '507f191e810c19729de860ec',
  paymentId: '507f191e810c19729de860ed',
  clientRequestId: 'c6a3f8f2-6a1d-4a59-9f41-1d2b8b9f0e10',
  uuid: 'd3b07384-d9a0-4c9b-8f3e-2d7b6c4a1e22',
};
const userId = '507f191e810c19729de86000';
const url = 'https://example.test/api/v1/x?today=2026-10-08';
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

// Route level: each v1/v2 pair runs the same operation and differs only in the ledger wrapper.
const api = join(process.cwd(), 'src/app/api');
const routeFiles = (version: string) =>
  readdirSync(join(api, version), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('route.ts'))
    .filter((file) => !/^(auth|me|exchange-rates|capabilities)\/|\/exchange-rates\//.test(file))
    .sort();
const methods = ['GET', 'POST', 'PATCH', 'DELETE'] as const;

describe('paired v1/v2 member routes', () => {
  const pairs = routeFiles('v1');

  it('covers exactly the 24 paired routes', () => {
    expect(pairs).toHaveLength(24);
    expect(routeFiles('v2')).toEqual(pairs);
  });

  it.each(pairs)('%s dispatches the same operation in both versions', async (file) => {
    const v1 = await import(join(api, 'v1', file));
    const v2 = await import(join(api, 'v2', file));
    const exported = methods.filter((method) => method in v1);
    expect(exported.length).toBeGreaterThan(0);
    expect(methods.filter((method) => method in v2)).toEqual(exported);
    for (const method of exported) {
      const runs: { version: number; service: string; args: unknown[] }[] = [];
      for (const [version, route] of [
        [1, v1],
        [2, v2],
      ] as const) {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: userId });
        for (const [name, fn] of Object.entries(mocks.service))
          fn.mockImplementation(async (...args: unknown[]) => {
            const shown = args.map((arg) =>
              typeof arg === 'function' ? 'fn' : arg instanceof Request ? arg.method : arg
            );
            runs.push({ version: isLedgerV2() ? 2 : 1, service: name, args: shown });
            return { ok: true };
          });
        const response: Response = await route[method](req(method), {
          params: Promise.resolve(ids),
        });
        if (version === 1) expect(await response.json()).toEqual({ data: { ok: true } });
        // The stub is not a v2 DTO, so the declared schema must reject it.
        else expect(response.status).toBe(503);
      }
      expect(runs.map((run) => run.version)).toEqual([1, 2]);
      expect(runs[1].service).toBe(runs[0].service);
      expect(runs[1].args).toEqual(runs[0].args);
    }
  });
});
