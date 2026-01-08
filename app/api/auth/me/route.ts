import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: '未登入' },
        { status: 401 }
      );
    }

    const user = db.prepare(`
      SELECT id, username, display_name, created_at
      FROM users
      WHERE id = ?
    `).get(session.userId);

    if (!user) {
      return NextResponse.json(
        { error: '用戶不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: '獲取用戶信息失敗' },
      { status: 500 }
    );
  }
}
