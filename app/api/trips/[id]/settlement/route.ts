import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { calculateSettlement } from '@/lib/settlement';
import { getTripId } from '@/lib/permissions';

// 獲取旅行結算
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

    // 獲取所有成員
    const { data: membersData } = await supabase
      .from('trip_members')
      .select(`
        users!inner (
          id,
          username,
          display_name
        )
      `)
      .eq('trip_id', tripId);

    const members = membersData?.map((m: any) => m.users) || [];

    // 計算每個成員的淨餘額
    const balances = await Promise.all(
      members.map(async (member: any) => {
        // 計算總付款
        const { data: paidData } = await supabase
          .from('expenses')
          .select('amount')
          .eq('payer_id', member.id)
          .eq('trip_id', tripId);

        const totalPaid = paidData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

        // 計算總應付
        const { data: owedData } = await supabase
          .from('expense_splits')
          .select('share_amount, expenses!inner(trip_id)')
          .eq('user_id', member.id)
          .eq('expenses.trip_id', tripId);

        const totalOwed = owedData?.reduce((sum, s) => sum + (s.share_amount || 0), 0) || 0;

        const balance = totalPaid - totalOwed;

        return {
          userId: member.id,
          username: member.display_name,
          totalPaid,
          totalOwed,
          balance,
        };
      })
    );

    // 使用結算演算法計算轉帳方案 (需要複製一份數據,因為演算法會修改 balance)
    const balancesForCalculation = balances.map(b => ({ ...b }));
    const transactions = calculateSettlement(balancesForCalculation);

    // 計算總支出
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('amount')
      .eq('trip_id', tripId);

    const totalExpenses = expensesData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

    return NextResponse.json({
      balances,
      transactions,
      totalExpenses,
    });
  } catch (error) {
    console.error('Get settlement error:', error);
    return NextResponse.json(
      { error: '獲取結算信息失敗' },
      { status: 500 }
    );
  }
}
