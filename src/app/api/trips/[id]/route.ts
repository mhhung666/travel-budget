import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { requireAdmin, getTripId } from '@/lib/permissions';

// 獲取旅行詳情
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 檢查用戶是否是此旅行的成員
    const { data: isMember, error: memberError } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', session.userId)
      .single();

    if (memberError || !isMember) {
      return NextResponse.json({ error: '您不是此旅行的成員' }, { status: 403 });
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
    console.error('Get trip error:', error);
    return NextResponse.json({ error: '獲取旅行詳情失敗' }, { status: 500 });
  }
}

// 更新旅行資訊 (僅管理員)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證管理員權限
    try {
      await requireAdmin(session.userId, tripId);
    } catch (error) {
      return NextResponse.json({ error: '只有管理員可以編輯旅行' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, start_date, end_date, location } = body;

    // 驗證必填欄位
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return NextResponse.json({ error: '旅行名稱不能為空' }, { status: 400 });
    }

    // 驗證日期
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return NextResponse.json({ error: '開始日期不能晚於結束日期' }, { status: 400 });
    }

    // 準備更新資料
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (location !== undefined) updateData.location = location || null;

    // 更新旅行
    const { data: trip, error: updateError } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', tripId)
      .select('id, name, description, start_date, end_date, location, created_at, hash_code')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ trip });
  } catch (error) {
    console.error('Update trip error:', error);
    return NextResponse.json({ error: '更新旅行失敗' }, { status: 500 });
  }
}

// 刪除旅行 (僅管理員)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: '未登入' }, { status: 401 });
    }

    const { id } = await params;

    // 支援 hash_code 或數字 ID
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證管理員權限
    try {
      await requireAdmin(session.userId, tripId);
    } catch (error) {
      return NextResponse.json({ error: '只有管理員可以刪除旅行' }, { status: 403 });
    }

    // 刪除旅行 (CASCADE 會自動刪除相關的 trip_members, expenses, expense_splits)
    const { error: deleteError } = await supabase.from('trips').delete().eq('id', tripId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: '旅行已刪除' }, { status: 200 });
  } catch (error) {
    console.error('Delete trip error:', error);
    return NextResponse.json({ error: '刪除旅行失敗' }, { status: 500 });
  }
}
