import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { getTripId } from '@/lib/permissions';

// 加入旅行 (支援 hash_code 或數字 ID)
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
        { error: '請提供旅行 ID 或 hash code' },
        { status: 400 }
      );
    }

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(trip_id);
    if (!tripId) {
      return NextResponse.json(
        { error: '旅行不存在' },
        { status: 404 }
      );
    }

    // 檢查是否已經是成員
    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: '您已經是此旅行的成員' },
        { status: 409 }
      );
    }

    // 加入旅行 (一般成員身分)
    const { error: insertError } = await supabase
      .from('trip_members')
      .insert({
        trip_id: tripId,
        user_id: session.userId,
        role: 'member'  // 加入的成員預設為一般成員
      });

    if (insertError) {
      throw insertError;
    }

    // 返回旅行資訊
    const { data: trip } = await supabase
      .from('trips')
      .select('id, name, hash_code')
      .eq('id', tripId)
      .single();

    return NextResponse.json({
      success: true,
      trip
    });
  } catch (error) {
    console.error('Join trip error:', error);
    return NextResponse.json(
      { error: '加入旅行失敗' },
      { status: 500 }
    );
  }
}
