import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

// 獲取旅行成員列表
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
      SELECT u.id, u.username, u.display_name, tm.joined_at
      FROM users u
      INNER JOIN trip_members tm ON u.id = tm.user_id
      WHERE tm.trip_id = ?
      ORDER BY tm.joined_at ASC
    `).all(tripId);

    return NextResponse.json({ members });
  } catch (error) {
    console.error('Get trip members error:', error);
    return NextResponse.json(
      { error: '獲取成員列表失敗' },
      { status: 500 }
    );
  }
}
