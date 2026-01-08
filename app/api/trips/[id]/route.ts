import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
    const { data: isMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (!isMember) {
      return NextResponse.json(
        { error: '您不是此旅行的成員' },
        { status: 403 }
      );
    }

    // 獲取旅行詳情
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, description, created_at')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
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
