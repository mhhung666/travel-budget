import { MONEY_EPSILON } from '@/lib/money';
import { readSettlementDetail, type SettlementDetail } from '@/lib/settlementRead';
import { requireTripMember } from './access';
import { settlementSchema, type MobileSettlement } from './contract';

/**
 * Distinguishes "nothing to settle yet", "everything settled" and "money still owed" so clients do
 * not infer them from empty arrays. Any remaining balance counts as outstanding, even when legacy
 * data leaves no transfer suggestion.
 */
export function settlementStatus(settlement: SettlementDetail): MobileSettlement['status'] {
  if (
    settlement.transfers.length > 0 ||
    settlement.balances.some((balance) => Math.abs(balance.balance) > MONEY_EPSILON)
  )
    return 'outstanding';
  return settlement.totalExpenses === 0 && settlement.payments.length === 0 ? 'empty' : 'settled';
}

export function toMobileSettlement(settlement: SettlementDetail): MobileSettlement {
  const names = new Map(settlement.balances.map((balance) => [balance.userId, balance.username]));
  return settlementSchema.parse({
    status: settlementStatus(settlement),
    totalExpenses: settlement.totalExpenses,
    // `Balance.username` carries the display name; the login username is never sent.
    balances: settlement.balances.map((balance) => ({
      userId: balance.userId,
      displayName: balance.username,
      ...(settlement.virtualMembers
        ? { isVirtual: settlement.virtualMembers[balance.userId] === true }
        : {}),
      totalPaid: balance.totalPaid,
      totalOwed: balance.totalOwed,
      balance: balance.balance,
    })),
    suggestedTransfers: settlement.transfers.map((transfer) => ({
      fromId: transfer.fromId,
      fromName: names.get(transfer.fromId) ?? '',
      ...(settlement.virtualMembers
        ? {
            fromIsVirtual: settlement.virtualMembers[transfer.fromId] === true,
            toIsVirtual: settlement.virtualMembers[transfer.toId] === true,
          }
        : {}),
      toId: transfer.toId,
      toName: names.get(transfer.toId) ?? '',
      amount: transfer.amount,
    })),
    payments: settlement.payments.map((payment) => ({
      id: payment.id,
      fromId: payment.fromId || null,
      fromName: payment.fromId ? payment.fromName : '',
      ...(settlement.virtualMembers
        ? {
            fromIsVirtual: settlement.virtualMembers[payment.fromId] === true,
            toIsVirtual: settlement.virtualMembers[payment.toId] === true,
          }
        : {}),
      toId: payment.toId || null,
      toName: payment.toId ? payment.toName : '',
      amount: payment.amount,
      note: payment.note || null,
      createdAt: payment.createdAt,
    })),
  });
}

export async function mobileSettlement(userId: string, id: string) {
  const tripId = await requireTripMember(userId, id);
  return toMobileSettlement(await readSettlementDetail(tripId));
}
