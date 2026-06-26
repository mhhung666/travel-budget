import { NextResponse } from 'next/server';
import { Trip, Expense, Payment } from '@/models';
import { calculateSettlement, applyPayments } from '@/lib/settlement';
import { toPaymentRecord, type PaymentDtoInput } from '@/lib/dto';
import { withPublicTrip } from '@/lib/withPublicTrip';

type PopulatedMember = {
  user: { _id: { toString(): string }; username: string; displayName: string } | null;
};

type LeanExpenseForSettlement = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

// 公開獲取旅行結算（不需登入）
export const GET = withPublicTrip(
  async ({ tripId }) => {
    // 一次取出成員 + 全部支出（含內嵌 splits）+ 已登記還款，其餘記憶體計算
    const [trip, expenses, paymentDocs] = await Promise.all([
      Trip.findById(tripId)
        .populate('members.user', 'username displayName')
        .select('members')
        .lean<{ members: PopulatedMember[] } | null>(),
      Expense.find({ trip: tripId })
        .select('payer amount splits')
        .lean<LeanExpenseForSettlement[]>(),
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
      totalExpenses += e.amount || 0;
      const payerId = e.payer.toString();
      paidByUser.set(payerId, (paidByUser.get(payerId) || 0) + (e.amount || 0));
      for (const s of e.splits || []) {
        const uid = s.user.toString();
        owedByUser.set(uid, (owedByUser.get(uid) || 0) + (s.shareAmount || 0));
      }
    }

    const expenseBalances = members.map((member) => {
      const userId = member!._id.toString();
      const totalPaid = paidByUser.get(userId) || 0;
      const totalOwed = owedByUser.get(userId) || 0;
      return {
        userId,
        username: member!.displayName,
        totalPaid,
        totalOwed,
        balance: totalPaid - totalOwed,
      };
    });

    const payments = paymentDocs.map(toPaymentRecord);
    const balances = applyPayments(
      expenseBalances,
      payments.map((p) => ({ from: p.fromId, to: p.toId, amount: p.amount }))
    );
    const transactions = calculateSettlement(balances.map((b) => ({ ...b })));

    return NextResponse.json({ balances, transactions, payments, totalExpenses });
  },
  { logLabel: 'Get public settlement error' }
);
