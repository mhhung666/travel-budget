import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSession } from '@/lib/auth';

// 獲取用戶的所有旅行
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    // 查詢用戶參與的所有旅行
    const trips = db.prepare(`
      SELECT t.id, t.name, t.description, t.created_at,
             COUNT(tm.user_id) as member_count
      FROM trips t
      INNER JOIN trip_members tm ON t.id = tm.trip_id
      WHERE tm.user_id = ?
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all(session.userId);

    return NextResponse.json({ trips });
  } catch (error) {
    console.error('Get trips error:', error);
    return NextResponse.json(
      { error: '獲取旅行列表失敗' },
      { status: 500 }
    );
  }
}

// 創建新旅行
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: '旅行名稱不能為空' },
        { status: 400 }
      );
    }

    // 開始事務
    const createTrip = db.transaction(() => {
      // 創建旅行
      const result = db.prepare(`
        INSERT INTO trips (name, description)
        VALUES (?, ?)
      `).run(name.trim(), description?.trim() || null);

      const tripId = result.lastInsertRowid;

      // 將創建者加入旅行成員
      db.prepare(`
        INSERT INTO trip_members (trip_id, user_id)
        VALUES (?, ?)
      `).run(tripId, session.userId);

      return tripId;
    });

    const tripId = createTrip();

    // 獲取完整的旅行信息
    const trip = db.prepare(`
      SELECT id, name, description, created_at
      FROM trips
      WHERE id = ?
    `).get(tripId);

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    console.error('Create trip error:', error);
    return NextResponse.json(
      { error: '創建旅行失敗' },
      { status: 500 }
    );
  }
}
