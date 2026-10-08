import { mongo } from 'mongoose';
import { isCentShare } from '@travel-budget/contracts';
import { setBudgetSchema, type SetBudgetInput } from './validation';
import { withTripWriteInDatabase } from './tripWriteTransaction';
import { parseLedgerInput, ledgerMismatch, ledgerStamp, LedgerError, isLedgerV2 } from './ledger';

/** Actor-only setter, shared by future Web/v2 adapters; a replacement is naturally idempotent. */
export async function setBudgetForActor(
  db: mongo.Db,
  actorId: string,
  tripId: string,
  body: SetBudgetInput
) {
  const input = parseLedgerInput(setBudgetSchema, body);
  if (!isLedgerV2() && input.base_currency && input.base_currency !== 'TWD')
    throw new LedgerError('LEDGER_CURRENCY_MISMATCH');
  if (isLedgerV2() && !input.base_currency) throw new LedgerError('VALIDATION_ERROR');
  normalizeBudgetAmounts(input);
  return withTripWriteInDatabase(db, tripId, actorId, async (session) => {
    if (ledgerMismatch()) throw new LedgerError('LEDGER_CURRENCY_MISMATCH');
    const budget = normalizeBudget(input);
    await db
      .collection('trips')
      .updateOne(
        { _id: new mongo.ObjectId(tripId), 'members.user': new mongo.ObjectId(actorId) },
        { $set: { 'members.$.budget': budget } },
        { session }
      );
    return budget;
  });
}

function normalizeBudgetAmounts(input: SetBudgetInput) {
  if (
    (input.total != null && !isCentShare(input.total)) ||
    (input.categories ?? []).some((c) => !isCentShare(c.amount))
  )
    throw new LedgerError('VALIDATION_ERROR');
}
export function normalizeBudget(input: SetBudgetInput) {
  normalizeBudgetAmounts(input);
  const total = input.total != null && input.total > 0 ? input.total : null;
  const byCategory = new Map<string, number>();
  for (const c of input.categories ?? []) if (c.amount > 0) byCategory.set(c.category, c.amount);
  const categories = Array.from(byCategory, ([category, amount]) => ({ category, amount }));
  const budget =
    total === null && !categories.length ? null : { ...ledgerStamp(), total, categories };
  return budget;
}
