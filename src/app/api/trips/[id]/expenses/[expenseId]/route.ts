import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId } from '@/lib/permissions';

// 編輯支出
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id, expenseId } = await params;
    const body = await request.json();

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    const expenseIdNum = parseInt(expenseId);

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json({ error: '您不是此旅行的成員' }, { status: 403 });
    }

    // 檢查支出是否存在且屬於該旅行
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', expenseIdNum)
      .eq('trip_id', tripId)
      .single();

    if (expenseError || !expense) {
      return NextResponse.json({ error: '支出不存在' }, { status: 404 });
    }

    // 驗證輸入
    const { description, original_amount, currency, exchange_rate, category } = body;

    if (description !== undefined && description.trim() === '') {
      return NextResponse.json({ error: '項目描述不可為空' }, { status: 400 });
    }

    if (original_amount !== undefined && original_amount <= 0) {
      return NextResponse.json({ error: '金額必須大於 0' }, { status: 400 });
    }

    if (currency !== undefined) {
      const validCurrencies = ['TWD', 'JPY', 'USD', 'EUR', 'HKD'];
      if (!validCurrencies.includes(currency)) {
        return NextResponse.json({ error: '不支援的幣別' }, { status: 400 });
      }

      if (currency !== 'TWD' && (!exchange_rate || exchange_rate <= 0)) {
        return NextResponse.json({ error: '匯率必須大於 0' }, { status: 400 });
      }
    }

    if (category !== undefined) {
      const validCategories = [
        'accommodation',
        'transportation',
        'food',
        'shopping',
        'entertainment',
        'tickets',
        'other',
      ];
      if (!validCategories.includes(category)) {
        return NextResponse.json({ error: '不支援的消費類別' }, { status: 400 });
      }
    }

    // 準備更新資料
    const updateData: any = {};
    if (description !== undefined) updateData.description = description.trim();
    if (original_amount !== undefined) updateData.original_amount = original_amount;
    if (currency !== undefined) updateData.currency = currency;
    if (exchange_rate !== undefined) updateData.exchange_rate = exchange_rate;
    if (category !== undefined) updateData.category = category;

    // 如果修改了金額或匯率,需要重新計算 TWD 金額
    if (original_amount !== undefined || exchange_rate !== undefined) {
      // 獲取當前的 expense 資料
      const { data: currentExpense } = await supabase
        .from('expenses')
        .select('original_amount, exchange_rate')
        .eq('id', expenseIdNum)
        .single();

      const newOriginalAmount = original_amount ?? currentExpense?.original_amount ?? 0;
      const newExchangeRate = exchange_rate ?? currentExpense?.exchange_rate ?? 1;
      updateData.amount = newOriginalAmount * newExchangeRate;
    }

    // 更新支出
    const { error: updateError } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', expenseIdNum);

    if (updateError) {
      throw updateError;
    }

    // 如果金額改變,需要重新計算分帳金額
    if (updateData.amount !== undefined) {
      // 獲取分帳人數
      const { data: splits, error: splitsError } = await supabase
        .from('expense_splits')
        .select('id')
        .eq('expense_id', expenseIdNum);

      if (splitsError) throw splitsError;

      if (splits && splits.length > 0) {
        const shareAmount = updateData.amount / splits.length;

        // 更新所有分帳記錄
        const { error: updateSplitsError } = await supabase
          .from('expense_splits')
          .update({ share_amount: shareAmount })
          .eq('expense_id', expenseIdNum);

        if (updateSplitsError) throw updateSplitsError;
      }
    }

    // 獲取更新後的支出資料
    const { data: updatedExpense, error: fetchError } = await supabase
      .from('expenses')
      .select(
        `
        *,
        payer:users!expenses_payer_id_fkey(username),
        expense_splits(
          user_id,
          share_amount,
          user:users(username)
        )
      `
      )
      .eq('id', expenseIdNum)
      .single();

    if (fetchError) throw fetchError;

    // 格式化回應
    const response = {
      ...updatedExpense,
      payer_name: updatedExpense.payer.username,
      splits: updatedExpense.expense_splits.map((split: any) => ({
        user_id: split.user_id,
        username: split.user.username,
        share_amount: split.share_amount,
      })),
    };

    return NextResponse.json({
      message: '支出已更新',
      expense: response,
    });
  } catch (error) {
    console.error('Update expense error:', error);
    return NextResponse.json({ error: '更新支出失敗' }, { status: 500 });
  }
}

// 刪除支出
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id, expenseId } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    const expenseIdNum = parseInt(expenseId);

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json({ error: '您不是此旅行的成員' }, { status: 403 });
    }

    // 檢查支出是否存在且屬於該旅行
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id, payer_id')
      .eq('id', expenseIdNum)
      .eq('trip_id', tripId)
      .single();

    if (expenseError || !expense) {
      return NextResponse.json({ error: '支出不存在' }, { status: 404 });
    }

    // 刪除支出(分帳記錄會因為外鍵級聯刪除)
    const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseIdNum);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    return NextResponse.json({ error: '刪除支出失敗' }, { status: 500 });
  }
}
