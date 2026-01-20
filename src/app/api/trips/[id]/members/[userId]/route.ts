import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { requireAdmin, getTripId } from '@/lib/permissions';

// 移除旅行成員 (僅管理員)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id, userId } = await params;
    const targetUserId = parseInt(userId);

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證管理員權限
    try {
      await requireAdmin(session.userId, tripId);
    } catch (error) {
      return NextResponse.json({ error: '只有管理員可以移除成員' }, { status: 403 });
    }

    // 防止管理員移除自己
    if (session.userId === targetUserId) {
      return NextResponse.json({ error: '管理員不能移除自己' }, { status: 400 });
    }

    // 檢查目標用戶是否是旅行成員
    const { data: memberCheck } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', targetUserId)
      .single();

    if (!memberCheck) {
      return NextResponse.json({ error: '該用戶不是此旅行的成員' }, { status: 404 });
    }

    // 檢查該成員是否有支出記錄
    const { data: expenses } = await supabase
      .from('expenses')
      .select('id')
      .eq('trip_id', tripId)
      .eq('payer_id', targetUserId)
      .limit(1);

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('expense_id')
      .eq('user_id', targetUserId)
      .limit(1);

    // 如果有支出記錄,給予警告但仍允許移除
    // (保留支出記錄以維持帳務完整性)
    const hasExpenses = (expenses && expenses.length > 0) || (splits && splits.length > 0);

    // 移除成員
    const { error: deleteError } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', targetUserId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      message: '成員已移除',
      warning: hasExpenses ? '該成員的支出記錄已保留' : undefined,
    });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: '移除成員失敗' }, { status: 500 });
  }
}
