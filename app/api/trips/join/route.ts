import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

// 加入旅行
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const body = await request.json();
    const { trip_id } = body;

    if (!trip_id) {
      return NextResponse.json(
        { error: '請提供旅行 ID' },
        { status: 400 }
      );
    }

    // 檢查旅行是否存在
    const trip = db.prepare('SELECT id FROM trips WHERE id = ?').get(trip_id);
    if (!trip) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查是否已經是成員
    const existingMember = db.prepare(`
      SELECT id FROM trip_members
      WHERE trip_id = ? AND user_id = ?
    `).get(trip_id, session.userId);

    if (existingMember) {
      return NextResponse.json(
        { error: '您已經是此旅行的成員' },
        { status: 409 }
      );
    }

    // 加入旅行
    db.prepare(`
      INSERT INTO trip_members (trip_id, user_id)
      VALUES (?, ?)
    `).run(trip_id, session.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Join trip error:', error);
    return NextResponse.json(
      { error: '加入旅行失敗' },
      { status: 500 }
    );
  }
}
