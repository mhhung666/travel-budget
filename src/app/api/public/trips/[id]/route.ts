import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';

// 公開獲取旅行詳情（不需登入）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 獲取旅行詳情
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('Get public trip error:', error);
    return NextResponse.json({ error: '獲取旅行詳情失敗' }, { status: 500 });
  }
}
