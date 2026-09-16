import { Types } from 'mongoose';
import { roundMoney, roundMoneyExpr, normalizedSplitsExpr } from '@/lib/money';
import { Expense, Payment } from '@/models';

export type TripListSummary = {
  /** 我的分攤花費（TWD），與 readTripShell.total_spent、結算 totalOwed 同值。 */
  mySpent: number;
  /** 我的結算餘額（TWD，已抵銷還款）；正＝應收、負＝應付，與結算頁 balances 同值。 */
  myBalance: number;
};

type ExpenseRow = { _id: Types.ObjectId; paid: number; owed: number };
type PaymentRow = {
  trip: Types.ObjectId;
  from: Types.ObjectId;
  to: Types.ObjectId;
  amount: number;
};

/**
 * 旅行列表卡片的個人摘要。一次聚合全部支出、一次查還款，不逐趟呼叫 readSettlement。
 * Internal read service: tripIds 必須是 viewer 身為成員的旅行（由 getTrips 的查詢保證）。
 */
export async function readTripListSummaries(
  tripIds: string[],
  viewerId: string
): Promise<Map<string, TripListSummary>> {
  const result = new Map<string, TripListSummary>();
  if (tripIds.length === 0) return result;
  const tripObjectIds = tripIds.map((id) => new Types.ObjectId(id));
  const viewerObjectId = new Types.ObjectId(viewerId);

  const [expenseRows, payments] = await Promise.all([
    Expense.aggregate<ExpenseRow>([
      { $match: { trip: { $in: tripObjectIds } } },
      { $set: { splits: normalizedSplitsExpr() } },
      {
        $group: {
          _id: '$trip',
          // 與 readSettlement 同順序：逐筆取到分再加總。比字串以容納歷史字串型 id。
          paid: {
            $sum: {
              $cond: [{ $eq: [{ $toString: '$payer' }, viewerId] }, roundMoneyExpr('$amount'), 0],
            },
          },
          owed: {
            $sum: {
              $reduce: {
                input: '$splits',
                initialValue: 0,
                in: {
                  $add: [
                    '$$value',
                    {
                      $cond: [
                        { $eq: [{ $toString: '$$this.user' }, viewerId] },
                        roundMoneyExpr('$$this.shareAmount'),
                        0,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ]),
    Payment.find({
      trip: { $in: tripObjectIds },
      $or: [{ from: viewerObjectId }, { to: viewerObjectId }],
    })
      .sort({ createdAt: -1 })
      .select('trip from to amount')
      .lean<PaymentRow[]>(),
  ]);

  // 還款抵銷與 applyPayments 相同：from 的餘額加回、to 的餘額扣掉。
  const paymentDelta = new Map<string, number>();
  for (const payment of payments) {
    if (!(payment.amount > 0)) continue;
    const tripId = payment.trip.toString();
    const sign = payment.from.toString() === viewerId ? 1 : -1;
    paymentDelta.set(tripId, (paymentDelta.get(tripId) ?? 0) + sign * payment.amount);
  }

  const expensesByTrip = new Map(expenseRows.map((row) => [row._id.toString(), row]));
  for (const tripId of tripIds) {
    const row = expensesByTrip.get(tripId);
    const paid = roundMoney(row?.paid ?? 0);
    const owed = roundMoney(row?.owed ?? 0);
    result.set(tripId, {
      mySpent: owed,
      myBalance: roundMoney(roundMoney(paid - owed) + (paymentDelta.get(tripId) ?? 0)),
    });
  }
  return result;
}
