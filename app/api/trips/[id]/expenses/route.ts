import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId } from '@/lib/permissions';

// 獲取旅行的所有支出
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取所有支出及其分帳詳情
    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select(`
        id,
        amount,
        description,
        date,
        created_at,
        payer:users!expenses_payer_id_fkey (
          id,
          username,
          display_name
        )
      `)
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
          .select(`
            user_id,
            share_amount,
            users!expense_splits_user_id_fkey (
              username,
              display_name
            )
          `)
          .eq('expense_id', expense.id);

        // 重新格式化資料
        const formattedSplits = splits?.map((split: any) => {
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
          description: expense.description,
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
    console.error('Get expenses error:', error);
    return NextResponse.json(
      { error: '獲取支出列表失敗' },
      { status: 500 }
    );
  }
}

// 新增支出
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { payer_id, amount, description, date, split_with } = body;

    // 驗證輸入
    if (!payer_id || !amount || !description || !date || !split_with || split_with.length === 0) {
      return NextResponse.json(
        { error: '所有欄位都是必填的' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: '金額必須大於 0' },
        { status: 400 }
      );
    }

    // 驗證 payer 和所有 split_with 成員都在旅行中
    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId);

    const memberIds = members?.map(m => m.user_id) || [];

    if (!memberIds.includes(payer_id)) {
      return NextResponse.json(
        { error: '付款人不是旅行成員' },
        { status: 400 }
      );
    }

    for (const userId of split_with) {
      if (!memberIds.includes(userId)) {
        return NextResponse.json(
          { error: '分帳對象必須都是旅行成員' },
          { status: 400 }
        );
      }
    }

    // 計算每人應分擔金額
    const shareAmount = amount / split_with.length;

    // 創建支出記錄
    const { data: expenseData, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        trip_id: tripId,
        payer_id,
        amount,
        description,
        date,
      })
      .select()
      .single();

    if (expenseError || !expenseData) {
      throw expenseError;
    }

    const expenseId = expenseData.id;

    // 創建分帳記錄
    const splitsToInsert = split_with.map((userId: number) => ({
      expense_id: expenseId,
      user_id: userId,
      share_amount: shareAmount,
    }));

    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitsToInsert);

    if (splitsError) {
      throw splitsError;
    }

    // 獲取完整的支出信息
    const { data: expense } = await supabase
      .from('expenses')
      .select(`
        id,
        amount,
        description,
        date,
        created_at,
        payer:users!expenses_payer_id_fkey (
          id,
          username,
          display_name
        )
      `)
      .eq('id', expenseId)
      .single();

    // 重新格式化資料
    const payer = Array.isArray(expense?.payer) ? expense.payer[0] : expense?.payer;
    const formattedExpense = {
      id: expense?.id,
      amount: expense?.amount,
      description: expense?.description,
      date: expense?.date,
      created_at: expense?.created_at,
      payer_id: payer?.id,
      payer_username: payer?.username,
      payer_name: payer?.display_name,
    };

    return NextResponse.json({ expense: formattedExpense }, { status: 201 });
  } catch (error) {
    console.error('Create expense error:', error);
    return NextResponse.json(
      { error: '新增支出失敗' },
      { status: 500 }
    );
  }
}
