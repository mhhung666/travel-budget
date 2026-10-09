import { mobileBudget, mobileSetBudget } from './budget';
import { after } from 'next/server';
import { mobileMaintainExpense, mobileEditContext } from './expenseMaintenance';
import { mobileExpenseOptions, mobileExpensePreview } from './expenseOptions';
import { mobileExpenses, mobileExpense } from './expenses';
import { mobileCreateExpense, mobileExpenseRequest } from './expenseWrite';
import { mobileTripMembers, mobileManageMember } from './members';
import { mobilePaymentContext, mobileWritePayment } from './payments';
import { requireMobileUser } from './session';
import { mobileSettlement } from './settlement';
import {
  mobileTripAccess,
  mobileManageTripAccess,
  mobileMemberClaimInvitation,
} from './tripAccess';
import { mobileEnterTrip, mobileMutationRequest, mobileInvitation } from './tripEntry';
import { mobileManageTrip, mobileTripCurrency, mobileTripSettings } from './tripManagement';
import { mobileTrips, mobileLanding, viewerDate } from './trips';

type RouteParams = {
  id: string;
  expenseId: string;
  memberId: string;
  paymentId: string;
  clientRequestId: string;
  uuid: string;
};
type Operation<K extends keyof RouteParams> = (
  request: Request,
  userId: string,
  params: Pick<RouteParams, K>
) => Promise<unknown>;
const op = <K extends keyof RouteParams = never>(handler: Operation<K>) => handler;

/**
 * Signed-in member operations behind the native `/api/v2` routes. Each route only picks its v2
 * output schema; authorization, body reading and services live here, and the ledger version comes
 * from the wrapper's context, never from the operation.
 */
const operations = {
  'budget.context': op<'id'>((_, userId, p) => mobileBudget(userId, p.id)),
  'budget.set': op<'id'>((request, userId, p) => mobileSetBudget(request, userId, p.id)),
  // Trips and members
  'trip.list': op((request, userId) => mobileTrips(userId, new URL(request.url))),
  'trip.create': op((request, userId) => mobileEnterTrip(request, userId, 'trip.create')),
  'trip.join': op((request, userId) => mobileEnterTrip(request, userId, 'trip.join')),
  'mutation.request': op<'uuid'>((_, userId, p) => mobileMutationRequest(userId, p.uuid)),
  'trip.landing': op<'id'>((request, userId, p) =>
    mobileLanding(userId, p.id, viewerDate(new URL(request.url)))
  ),
  'trip.invitation': op<'id'>((_, userId, p) => mobileInvitation(userId, p.id)),
  'trip.settings': op<'id'>((_, userId, p) => mobileTripSettings(userId, p.id)),
  'trip.update': op<'id'>((request, userId, p) =>
    mobileManageTrip(request, userId, p.id, 'trip.update')
  ),
  'trip.archive': op<'id'>((request, userId, p) =>
    mobileManageTrip(request, userId, p.id, 'trip.archive')
  ),
  'trip.currencyContext': op<'id'>((_, userId, p) => mobileTripCurrency(userId, p.id)),
  'trip.currency': op<'id'>((request, userId, p) =>
    mobileManageTrip(request, userId, p.id, 'trip.currency')
  ),
  'access.context': op<'id'>((_, userId, p) => mobileTripAccess(userId, p.id)),
  'access.manage': op<'id'>((request, userId, p) => mobileManageTripAccess(request, userId, p.id)),
  'member.list': op<'id'>((_, userId, p) => mobileTripMembers(userId, p.id)),
  'member.create': op<'id'>((request, userId, p) => mobileManageMember(request, userId, p.id)),
  'member.update': op<'id' | 'memberId'>((request, userId, p) =>
    mobileManageMember(request, userId, p.id, p.memberId)
  ),
  'member.claimInvitation': op<'id' | 'memberId'>((_, userId, p) =>
    mobileMemberClaimInvitation(userId, p.id, p.memberId)
  ),
  // Expenses
  'expense.options': op<'id'>((_, userId, p) => mobileExpenseOptions(userId, p.id)),
  'expense.preview': op<'id'>((request, userId, p) => mobileExpensePreview(request, userId, p.id)),
  'expense.list': op<'id'>((request, userId, p) =>
    mobileExpenses(userId, p.id, new URL(request.url))
  ),
  // `after` runs the delivery trigger once the response has been sent, as the Web action does.
  'expense.create': op<'id'>((request, userId, p) =>
    mobileCreateExpense(request, userId, p.id, (task) => after(task))
  ),
  'expense.request': op<'id' | 'clientRequestId'>((_, userId, p) =>
    mobileExpenseRequest(userId, p.id, p.clientRequestId)
  ),
  'expense.detail': op<'id' | 'expenseId'>((_, userId, p) =>
    mobileExpense(userId, p.id, p.expenseId)
  ),
  'expense.editContext': op<'id' | 'expenseId'>((_, userId, p) =>
    mobileEditContext(userId, p.id, p.expenseId)
  ),
  'expense.update': op<'id' | 'expenseId'>((request, userId, p) =>
    mobileMaintainExpense(request, userId, p.id, p.expenseId, 'expense.update')
  ),
  'expense.delete': op<'id' | 'expenseId'>((request, userId, p) =>
    mobileMaintainExpense(request, userId, p.id, p.expenseId, 'expense.delete')
  ),
  // Settlement and payments
  'settlement.read': op<'id'>((_, userId, p) => mobileSettlement(userId, p.id)),
  'payment.context': op<'id'>((_, userId, p) => mobilePaymentContext(userId, p.id)),
  'payment.revokeContext': op<'id' | 'paymentId'>((_, userId, p) =>
    mobilePaymentContext(userId, p.id, p.paymentId)
  ),
  'payment.create': op<'id'>((request, userId, p) => mobileWritePayment(request, userId, p.id)),
  'payment.revoke': op<'id' | 'paymentId'>((request, userId, p) =>
    mobileWritePayment(request, userId, p.id, p.paymentId)
  ),
};

export type MobileOperation = keyof typeof operations;
type OperationParams<O extends MobileOperation> = Parameters<(typeof operations)[O]>[2];

/** Authenticates first, then runs the named operation; routes without params omit them. */
export async function mobileOperation<O extends MobileOperation>(
  operation: O,
  request: Request,
  params?: Promise<OperationParams<O>>
) {
  const user = await requireMobileUser(request);
  const run = operations[operation] as Operation<keyof RouteParams>;
  return run(request, user.id, ((await params) ?? {}) as RouteParams);
}
