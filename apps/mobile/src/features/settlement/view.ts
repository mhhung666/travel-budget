import type { Settlement } from '@/api/contracts';
import type { ReadMember } from '@/features/expenses/rows';

type Transfer = Settlement['suggestedTransfers'][number];

/** The viewer's own transfers first; everything else keeps the backend's order. */
export function orderTransfers(transfers: Transfer[], userId: string | undefined): Transfer[] {
  if (!userId) return transfers;
  const mine = (transfer: Transfer) => transfer.fromId === userId || transfer.toId === userId;
  return [...transfers.filter(mine), ...transfers.filter((transfer) => !mine(transfer))];
}
export function viewerBalance(settlement: Settlement, userId: string | undefined) {
  return settlement.balances.find((balance) => balance.userId === userId)?.balance ?? null;
}

/** Collect visible references for label indexes, including historical trip members. */
export function settlementMembers(settlement: Settlement): ReadMember[] {
  return [
    ...settlement.balances.map((b) => ({ id: b.userId, name: b.displayName })),
    ...settlement.suggestedTransfers.flatMap((r) => [
      { id: r.fromId, name: r.fromName },
      { id: r.toId, name: r.toName },
    ]),
    ...settlement.payments.flatMap((p) => [
      { id: p.fromId, name: p.fromName },
      { id: p.toId, name: p.toName },
    ]),
  ];
}
