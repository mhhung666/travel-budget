import { mongo } from 'mongoose';
import { budgetContextV2Schema } from '@travel-budget/contracts';
import { computeBudgetProgress } from './budget';
import { currentLedger, moneyTotal, LedgerError } from './ledger';
import { roundMoney } from './money';
import { withTripReadInDatabase } from './tripWriteTransaction';
import { webSettingsRevision } from './webSettingsWrite';

/** One authorized snapshot. All expense shares use the same calculator as the Web budget view. */
export async function readBudget(db: mongo.Db, actorId: string, tripId: string) {
  return withTripReadInDatabase(db, tripId, actorId, async (session) => {
    const trip = await db
      .collection('trips')
      .findOne({ _id: new mongo.ObjectId(tripId) }, { session });
    const stored = trip!.members.find(
      (m: { user: mongo.ObjectId }) => m.user.toString() === actorId
    )?.budget;
    const budget = stored
      ? {
          total: stored.total ?? null,
          categories: (stored.categories ?? []).map((c: { category: string; amount: number }) => ({
            category: c.category,
            amount: c.amount,
          })),
        }
      : null;
    const rows = await db
      .collection('expenses')
      .find(
        { trip: trip!._id },
        {
          session,
          projection: { category: 1, amount: 1, splits: 1 },
        }
      )
      .toArray();
    const progress = computeBudgetProgress(
      budget,
      rows.map((row) => ({
        category: row.category ?? 'other',
        amount: row.amount,
        splits: (row.splits ?? []).map(
          (s: { user?: { toString(): string } | null; shareAmount: number }) => ({
            user_id: s.user?.toString() ?? '',
            share_amount: s.shareAmount,
          })
        ),
      })),
      actorId
    );
    moneyTotal([progress.totalSpent]);
    progress.categories.forEach((c) => moneyTotal([c.spent]));
    const result = budgetContextV2Schema.safeParse({
      ledger: currentLedger(),
      tripId,
      revision: webSettingsRevision(tripId, actorId, trip!, 'budget', stored),
      budget,
      progress: {
        ...progress,
        remaining:
          progress.total === null ? null : roundMoney(progress.total - progress.totalSpent),
        categories: progress.categories.map((c) => ({
          ...c,
          remaining: c.budget === null ? null : roundMoney(c.budget - c.spent),
        })),
      },
    });
    if (!result.success) throw new LedgerError('LEDGER_DATA_INVALID');
    return result.data;
  });
}
