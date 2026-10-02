import { NextResponse } from 'next/server';
import { Expense } from '@/models';
import { withPublicTrip } from '@/lib/withPublicTrip';
import { toExpenseDto, type ExpenseDtoInput } from '@/lib/dto';

// 公開獲取旅行的所有支出（不需登入）
export const GET = withPublicTrip(
  async ({ tripId }) => {
    // splits 已內嵌，payer 與 splits.user 一次 populate（不再有 N+1）
    const expenses = await Expense.find({ trip: tripId })
      .sort({ date: -1, createdAt: -1 })
      .populate('payer', 'username displayName')
      .populate('splits.user', 'username displayName')
      .lean<ExpenseDtoInput[]>();

    // 與 actions 的 getExpenses 共用同一個映射，避免 snake_case DTO 平行漂移。
    // 收據刻意不外洩到公開分享頁（attachments: false）。
    const data = expenses.map((e) => toExpenseDto(e, tripId, { attachments: false }));

    return NextResponse.json({ expenses: data });
  },
  { logLabel: 'Get public expenses error' }
);
