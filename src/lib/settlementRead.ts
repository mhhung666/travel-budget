import { Trip, Expense, Payment, User } from '@/models';
import { calculateSettlement, applyPayments } from '@/lib/settlement';
import { roundMoney } from '@/lib/money';
import { toPaymentRecord, type PaymentDtoInput } from '@/lib/dto';
import type { Balance, Settlement } from '@/types';
type PopulatedMember = {
  user: { _id: { toString(): string }; username: string; displayName: string } | null;
};

type LeanExpenseForSettlement = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

export async function readSettlement(tripId: string, memberIds?: string[]): Promise<Settlement> {
  // 一次取出成員 + 全部支出（含內嵌 splits）+ 已登記還款，其餘在記憶體計算
  const [trip, expenses, paymentDocs] = await Promise.all([
    memberIds
      ? User.find({ _id: { $in: memberIds } })
          .select('username displayName')
          .lean<NonNullable<PopulatedMember['user']>[]>()
          .then((users) => {
            const byId = new Map(users.map((user) => [user._id.toString(), user]));
            return { members: memberIds.map((id) => ({ user: byId.get(id) ?? null })) };
          })
      : Trip.findById(tripId)
          .populate('members.user', 'username displayName')
          .select('members')
          .lean<{ members: PopulatedMember[] } | null>(),
    Expense.find({ trip: tripId }).select('payer amount splits').lean<LeanExpenseForSettlement[]>(),
    Payment.find({ trip: tripId })
      .sort({ createdAt: -1 })
      .populate('from', 'username displayName')
      .populate('to', 'username displayName')
      .select('from to amount note createdAt')
      .lean<PaymentDtoInput[]>(),
  ]);

  const members = (trip?.members || []).map((m) => m.user).filter((u) => u !== null);

  const paidByUser = new Map<string, number>();
  const owedByUser = new Map<string, number>();
  let totalExpenses = 0;

  for (const e of expenses) {
    // 逐筆先收斂到分，與統計、預算列同一種取整順序；舊資料若存了未取整的換算金額
    // （30.004），這裡加總後再取整會比統計多出一分。
    const amount = roundMoney(e.amount || 0);
    totalExpenses += amount;
    const payerId = e.payer.toString();
    paidByUser.set(payerId, (paidByUser.get(payerId) || 0) + amount);
    for (const s of e.splits || []) {
      const uid = s.user.toString();
      owedByUser.set(uid, (owedByUser.get(uid) || 0) + roundMoney(s.shareAmount || 0));
    }
  }

  const expenseBalances: Balance[] = members.map((member) => {
    const id = member!._id.toString();
    const totalPaid = roundMoney(paidByUser.get(id) || 0);
    const totalOwed = roundMoney(owedByUser.get(id) || 0);
    return {
      userId: id,
      username: member!.displayName,
      totalPaid,
      totalOwed,
      balance: roundMoney(totalPaid - totalOwed),
    };
  });

  const payments = paymentDocs.map(toPaymentRecord);

  // 把已登記還款淨額抵銷進餘額，再算最少轉帳（totalPaid/totalOwed 維持支出原值供顯示）
  const balances = applyPayments(
    expenseBalances,
    payments.map((p) => ({ from: p.fromId, to: p.toId, amount: p.amount }))
  );
  const transactions = calculateSettlement(balances.map((b) => ({ ...b })));

  return { balances, transactions, payments, totalExpenses: roundMoney(totalExpenses) };
}
