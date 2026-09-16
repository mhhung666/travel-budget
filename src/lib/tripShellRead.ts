import { Types } from 'mongoose';
import { roundMoney, roundMoneyExpr } from '@/lib/money';
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
                  // 逐筆收斂到分，與結算、統計同一種取整順序（舊資料可能存了未取整
                  // 的換算金額，加總後再取整會多出一分）。取整規則必須與 JS 端同源，
                  // 故走 roundMoneyExpr 而非 $round（後者是銀行家捨入，30.125 會少一分）。
                  roundMoneyExpr('$amount'),
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
                      // 比字串而非 ObjectId：結算與個人統計都用 `.toString()` 比對，
                      // 型別若不一致（歷史匯入的 splits.user 存成字串）只有這裡會漏算，
                      // 同一趟旅行就會出現「我的花費 0、結算卻有金額」。
                      {
                        $eq: [{ $toString: '$$this.user' }, viewerId],
                      },
                      roundMoneyExpr('$$this.shareAmount'),
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
    // 保留到分，與結算、統計、預算同精度（整數取整會讓同一筆錢在各頁差一元）。
    today_spent: roundMoney(totals.todaySpent),
    total_spent: roundMoney(totals.totalSpent),
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
