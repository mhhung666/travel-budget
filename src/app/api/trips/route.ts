import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { generateUniqueHashCode } from '@/lib/hashcode';

// 獲取用戶的所有旅行
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    // 查詢用戶參與的所有旅行
    const { data: tripMembers, error: tmError } = await supabase
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', session.userId);

    if (tmError) throw tmError;

    const tripIds = tripMembers?.map((tm) => tm.trip_id) || [];

    if (tripIds.length === 0) {
      return NextResponse.json({ trips: [] });
    }

    const { data: trips, error: tripsError } = await supabase
      .from('trips')
      .select(
        `
        id,
        name,
        description,
        created_at,
        hash_code,
        trip_members(count)
      `
      )
      .in('id', tripIds)
      .order('created_at', { ascending: false });

    if (tripsError) throw tripsError;

    // 格式化回應
    const formattedTrips = trips?.map((trip) => ({
      id: trip.id,
      hash_code: trip.hash_code,
      name: trip.name,
      description: trip.description,
      created_at: trip.created_at,
      member_count: trip.trip_members?.[0]?.count || 0,
    }));

    return NextResponse.json({ trips: formattedTrips });
  } catch (error) {
    console.error('Get trips error:', error);
    return NextResponse.json({ error: '獲取旅行列表失敗' }, { status: 500 });
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
      return NextResponse.json({ error: '旅行名稱不能為空' }, { status: 400 });
    }

    // 生成唯一的 hash_code
    const hashCode = await generateUniqueHashCode(async (code) => {
      const { data } = await supabase.from('trips').select('id').eq('hash_code', code).single();
      return data !== null;
    });

    // 創建旅行
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert([
        {
          name: name.trim(),
          description: description?.trim() || null,
          hash_code: hashCode,
        },
      ])
      .select()
      .single();

    if (tripError) throw tripError;

    // 將創建者加入旅行成員並設為管理員
    const { error: memberError } = await supabase.from('trip_members').insert([
      {
        trip_id: trip.id,
        user_id: session.userId,
        role: 'admin', // 創建者自動成為管理員
      },
    ]);

    if (memberError) throw memberError;

    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    console.error('Create trip error:', error);
    return NextResponse.json({ error: '創建旅行失敗' }, { status: 500 });
  }
}
