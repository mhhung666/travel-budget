import type { Settlement } from '@/api/contracts';

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
