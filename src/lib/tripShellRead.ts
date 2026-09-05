import { Types } from 'mongoose';
import { Expense } from '@/models';
import type { TripShell } from '@/types';
export type LeanTripShell = {
  _id: { toString(): string };
  name: string;
  startDate?: Date | null;
  endDate?: Date | null;
  hashCode: string;
  members: {
    user: { toString(): string };
    role?: 'admin' | 'member' | null;
    budget?: {
      total?: number | null;
      categories?: { category: string; amount: number }[];
    } | null;
  }[];
  legacyBudget?: {
    total?: number | null;
    categories?: { category: string; amount: number }[];
  } | null;
  currencySettings?: {
    defaultCurrency?: string | null;
    currencies?: { code: string; rate?: number | null }[];
  } | null;
};

type ShellExpenseAggregate = {
  expenseCount: number;
  totalSpent: number;
  todaySpent: number;
};

function mapBudget(
  budget: { total?: number | null; categories?: { category: string; amount: number }[] } | null
) {
  return budget
    ? {
        total: budget.total ?? null,
        categories: (budget.categories ?? []).map(({ category, amount }) => ({ category, amount })),
      }
    : null;
}

/** Internal read service: caller must resolve and authorize the Trip first. */
export async function readTripShell(
  trip: LeanTripShell,
  viewerId?: string,
  viewerDate?: string
): Promise<TripShell> {
  const tripId = trip._id.toString();
  const validViewerDate = /^\d{4}-\d{2}-\d{2}$/.test(viewerDate ?? '') ? viewerDate : null;
  const today = validViewerDate ? new Date(`${validViewerDate}T00:00:00.000Z`) : new Date();
  if (!validViewerDate) today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const aggregate = viewerId
    ? await Expense.aggregate<ShellExpenseAggregate>([
        { $match: { trip: new Types.ObjectId(tripId) } },
        {
          $group: {
            _id: null,
            expenseCount: { $sum: 1 },
            todaySpent: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$date', today] }, { $lt: ['$date', tomorrow] }] },
                  '$amount',
                  0,
                ],
              },
            },
            totalSpent: {
              $sum: {
                $reduce: {
                  input: '$splits',
                  initialValue: 0,
                  in: {
                    $cond: [
                      {
                        $eq: ['$$this.user', new Types.ObjectId(viewerId)],
                      },
                      '$$this.shareAmount',
                      0,
                    ],
                  },
                },
              },
            },
          },
        },
        { $project: { _id: 0, expenseCount: 1, todaySpent: 1, totalSpent: 1 } },
      ])
    : [];

  const self = viewerId
    ? trip.members.find((member) => member.user.toString() === viewerId)
    : undefined;
  const totals = aggregate[0] ?? { expenseCount: 0, todaySpent: 0, totalSpent: 0 };
  return {
    id: trip._id.toString(),
    name: trip.name,
    start_date: trip.startDate?.toISOString().slice(0, 10) ?? null,
    end_date: trip.endDate?.toISOString().slice(0, 10) ?? null,
    hash_code: trip.hashCode,
    role: viewerId ? (self?.role ?? 'member') : null,
    member_count: trip.members.length,
    expense_count: totals.expenseCount,
    today_spent: Math.round(totals.todaySpent),
    total_spent: Math.round(totals.totalSpent),
    budget: mapBudget(self?.budget ?? null),
    legacy_budget: viewerId ? mapBudget(trip.legacyBudget ?? null) : null,
    currency_settings: trip.currencySettings
      ? {
          default_currency: trip.currencySettings.defaultCurrency ?? null,
          currencies: (trip.currencySettings.currencies ?? []).map(({ code, rate }) => ({
            code,
            rate: rate ?? null,
          })),
        }
      : null,
  };
}
