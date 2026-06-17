import { NextRequest, NextResponse } from 'next/server';
import { Trip, Expense } from '@/models';
import { calculateSettlement } from '@/lib/settlement';
import { getTripIdByHashCode } from '@/lib/permissions';

type PopulatedMember = {
  user: { _id: { toString(): string }; username: string; displayName: string } | null;
};

type LeanExpenseForSettlement = {
  payer: { toString(): string };
  amount: number;
  splits: { user: { toString(): string }; shareAmount: number }[];
};

// 公開獲取旅行結算（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或 ObjectId
    const tripId = await getTripIdByHashCode(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 一次取出成員 + 全部支出（含內嵌 splits），其餘記憶體計算
    const [trip, expenses] = await Promise.all([
      Trip.findById(tripId)
        .populate('members.user', 'username displayName')
        .select('members')
        .lean<{ members: PopulatedMember[] } | null>(),
      Expense.find({ trip: tripId })
        .select('payer amount splits')
        .lean<LeanExpenseForSettlement[]>(),
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

    const balances = members.map((member) => {
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

    const transactions = calculateSettlement(balances.map((b) => ({ ...b })));

    return NextResponse.json({ balances, transactions, totalExpenses });
  } catch (error) {
    console.error('Get public settlement error:', error);
    return NextResponse.json({ error: '獲取結算信息失敗' }, { status: 500 });
  }
}
