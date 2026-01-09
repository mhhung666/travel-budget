import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId } from '@/lib/permissions';

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
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 檢查支出是否存在且屬於該旅行
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('id, payer_id')
      .eq('id', expenseIdNum)
      .eq('trip_id', tripId)
      .single();

    if (expenseError || !expense) {
      return NextResponse.json(
        { error: '支出不存在' },
        { status: 404 }
      );
    }

    // 只有付款人可以刪除支出
    if (expense.payer_id !== session.userId) {
      return NextResponse.json(
        { error: '只有付款人可以刪除此支出' },
        { status: 403 }
      );
    }

    // 刪除支出(分帳記錄會因為外鍵級聯刪除)
    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseIdNum);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    return NextResponse.json(
      { error: '刪除支出失敗' },
      { status: 500 }
    );
  }
}
