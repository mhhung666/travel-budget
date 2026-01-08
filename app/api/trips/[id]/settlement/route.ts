import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';
import { calculateSettlement } from '@/lib/settlement';

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
    const tripId = parseInt(id);

    // 檢查用戶是否是此旅行的成員
    const isMember = db.prepare(`
      SELECT id FROM trip_members
      WHERE trip_id = ? AND user_id = ?
    `).get(tripId, session.userId);

    if (!isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取所有成員
    const members = db.prepare(`
      SELECT u.id, u.username, u.display_name
      FROM users u
      INNER JOIN trip_members tm ON u.id = tm.user_id
      WHERE tm.trip_id = ?
    `).all(tripId) as any[];

    // 計算每個成員的淨餘額
    const balances = members.map(member => {
      // 計算總付款
      const totalPaid = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE payer_id = ? AND trip_id = ?
      `).get(member.id, tripId) as any;

      // 計算總應付
      const totalOwed = db.prepare(`
        SELECT COALESCE(SUM(share_amount), 0) as total
        FROM expense_splits es
        INNER JOIN expenses e ON es.expense_id = e.id
        WHERE es.user_id = ? AND e.trip_id = ?
      `).get(member.id, tripId) as any;

      const balance = totalPaid.total - totalOwed.total;

      return {
        userId: member.id,
        username: member.display_name,
        totalPaid: totalPaid.total,
        totalOwed: totalOwed.total,
        balance: balance,
      };
    });

    // 使用結算演算法計算轉帳方案 (需要複製一份數據,因為演算法會修改 balance)
    const balancesForCalculation = balances.map(b => ({ ...b }));
    const transactions = calculateSettlement(balancesForCalculation);

    // 計算總支出
    const totalExpenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE trip_id = ?
    `).get(tripId) as any;

    return NextResponse.json({
      balances,
      transactions,
      totalExpenses: totalExpenses.total,
    });
  } catch (error) {
    console.error('Get settlement error:', error);
    return NextResponse.json(
      { error: '獲取結算信息失敗' },
      { status: 500 }
    );
  }
}
