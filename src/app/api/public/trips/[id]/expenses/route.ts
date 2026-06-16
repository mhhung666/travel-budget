import { NextRequest, NextResponse } from 'next/server';
import { Expense } from '@/models';
import { getTripId } from '@/lib/permissions';

type PopulatedRef = { _id: { toString(): string }; username: string; displayName: string } | null;

type LeanExpense = {
  _id: { toString(): string };
  amount: number;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  description: string;
  category: string | null;
  date: Date;
  createdAt: Date;
  payer: PopulatedRef;
  splits: { user: PopulatedRef; shareAmount: number }[];
};

// 公開獲取旅行的所有支出（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或 ObjectId
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // splits 已內嵌，payer 與 splits.user 一次 populate（不再有 N+1）
    const expenses = await Expense.find({ trip: tripId })
      .sort({ date: -1, createdAt: -1 })
      .populate('payer', 'username displayName')
      .populate('splits.user', 'username displayName')
      .lean<LeanExpense[]>();

    const expensesWithSplits = expenses.map((expense) => ({
      id: expense._id.toString(),
      amount: expense.amount,
      original_amount: expense.originalAmount,
      currency: expense.currency,
      exchange_rate: expense.exchangeRate,
      description: expense.description,
      category: expense.category || 'other',
      date: expense.date instanceof Date ? expense.date.toISOString().slice(0, 10) : expense.date,
      created_at: expense.createdAt.toISOString(),
      payer_id: expense.payer?._id.toString(),
      payer_username: expense.payer?.username,
      payer_name: expense.payer?.displayName,
      splits: (expense.splits || []).map((split) => ({
        user_id: split.user?._id.toString(),
        share_amount: split.shareAmount,
        username: split.user?.username,
        display_name: split.user?.displayName,
      })),
    }));

    return NextResponse.json({ expenses: expensesWithSplits });
  } catch (error) {
    console.error('Get public expenses error:', error);
    return NextResponse.json({ error: '獲取支出列表失敗' }, { status: 500 });
  }
}
