import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id')
      .eq('id', trip_id)
      .single();

    if (tripError || !trip) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查是否已經是成員
    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip_id)
      .eq('user_id', session.userId)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: '您已經是此旅行的成員' },
        { status: 409 }
      );
    }

    // 加入旅行
    const { error: insertError } = await supabase
      .from('trip_members')
      .insert({ trip_id, user_id: session.userId });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Join trip error:', error);
    return NextResponse.json(
      { error: '加入旅行失敗' },
      { status: 500 }
    );
  }
}
