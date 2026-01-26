import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';

// 公開獲取旅行的所有支出（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 獲取所有支出及其分帳詳情
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(
        `
        id,
        amount,
        original_amount,
        currency,
        exchange_rate,
        description,
        category,
        date,
        created_at,
        payer:users!expenses_payer_id_fkey (
          id,
          username,
          display_name
        )
      `
      )
      .eq('trip_id', tripId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (expensesError) {
      throw expensesError;
    }

    // 為每個支出獲取分帳詳情
    const expensesWithSplits = await Promise.all(
      (expenses || []).map(async (expense: any) => {
        const { data: splits } = await supabase
          .from('expense_splits')
          .select(
            `
            user_id,
            share_amount,
            users!expense_splits_user_id_fkey (
              username,
              display_name
            )
          `
          )
          .eq('expense_id', expense.id);

        // 重新格式化資料
        const formattedSplits =
          splits?.map((split: any) => {
            const user = Array.isArray(split.users) ? split.users[0] : split.users;
            return {
              user_id: split.user_id,
              share_amount: split.share_amount,
              username: user?.username,
              display_name: user?.display_name,
            };
          }) || [];

        const payer = Array.isArray(expense.payer) ? expense.payer[0] : expense.payer;
        return {
          id: expense.id,
          amount: expense.amount,
          original_amount: expense.original_amount,
          currency: expense.currency,
          exchange_rate: expense.exchange_rate,
          description: expense.description,
          category: expense.category || 'other',
          date: expense.date,
          created_at: expense.created_at,
          payer_id: payer?.id,
          payer_username: payer?.username,
          payer_name: payer?.display_name,
          splits: formattedSplits,
        };
      })
    );

    return NextResponse.json({ expenses: expensesWithSplits });
  } catch (error) {
    console.error('Get public expenses error:', error);
    return NextResponse.json({ error: '獲取支出列表失敗' }, { status: 500 });
  }
}
