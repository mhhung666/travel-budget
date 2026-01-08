import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

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
    const tripId = parseInt(id);
    const expenseIdNum = parseInt(expenseId);

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

    // 檢查支出是否存在且屬於該旅行
    const expense = db.prepare(`
      SELECT id, payer_id FROM expenses
      WHERE id = ? AND trip_id = ?
    `).get(expenseIdNum, tripId) as any;

    if (!expense) {
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
    db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseIdNum);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    return NextResponse.json(
      { error: '刪除支出失敗' },
      { status: 500 }
    );
  }
}
