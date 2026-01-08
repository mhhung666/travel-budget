import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

// 獲取旅行詳情
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

    // 獲取旅行詳情
    const trip = db.prepare(`
      SELECT id, name, description, created_at
      FROM trips
      WHERE id = ?
    `).get(tripId);

    if (!trip) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('Get trip error:', error);
    return NextResponse.json(
      { error: '獲取旅行詳情失敗' },
      { status: 500 }
    );
  }
}
