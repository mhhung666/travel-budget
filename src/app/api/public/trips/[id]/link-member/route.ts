import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { getTripId } from '@/lib/permissions';
import { createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';

/**
 * 將虛擬成員連結到已存在的會員（登入後遷移資料）
 * POST /api/public/trips/[id]/link-member
 * Body: { virtualUserId, username, password }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { virtualUserId, username, password } = body;

    // 驗證 trip 存在
    const tripId = await getTripId(id);
    if (!tripId) {
      return NextResponse.json({ error: '旅行不存在' }, { status: 404 });
    }

    // 驗證 virtualUserId
    if (!virtualUserId || typeof virtualUserId !== 'number') {
      return NextResponse.json({ error: '無效的虛擬成員 ID' }, { status: 400 });
    }

    // 驗證目標用戶是虛擬成員
    const { data: virtualUser, error: vuError } = await supabase
      .from('users')
      .select('id, is_virtual')
      .eq('id', virtualUserId)
      .single();

    if (vuError || !virtualUser) {
      return NextResponse.json({ error: '找不到此用戶' }, { status: 404 });
    }

    if (!virtualUser.is_virtual) {
      return NextResponse.json({ error: '此用戶不是虛擬成員' }, { status: 400 });
    }

    // 驗證該虛擬成員屬於此 trip
    const { data: memberCheck } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', virtualUserId)
      .single();

    if (!memberCheck) {
      return NextResponse.json({ error: '此虛擬成員不屬於此旅行' }, { status: 400 });
    }

    // 驗證登入資料
    const validation = loginSchema.safeParse({ username, password });
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    // 查找目標真實用戶
    const { data: realUser, error: ruError } = await supabase
      .from('users')
      .select('id, username, password, is_virtual')
      .ilike('username', validation.data.username)
      .single();

    if (ruError || !realUser) {
      return NextResponse.json({ error: '用戶名或密碼錯誤' }, { status: 401 });
    }

    if (realUser.is_virtual) {
      return NextResponse.json({ error: '無法連結到另一個虛擬成員' }, { status: 400 });
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(validation.data.password, realUser.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: '用戶名或密碼錯誤' }, { status: 401 });
    }

    const realUserId = realUser.id;

    // 檢查真實用戶是否已是此 trip 的成員
    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('user_id', realUserId)
      .single();

    // === 遷移資料 ===

    // 1. 遷移 expenses.payer_id
    const { error: expenseError } = await supabase
      .from('expenses')
      .update({ payer_id: realUserId })
      .eq('payer_id', virtualUserId)
      .eq('trip_id', tripId);

    if (expenseError) throw expenseError;

    // 2. 遷移 expense_splits.user_id（需要先取得此 trip 的 expense IDs）
    const { data: tripExpenses } = await supabase
      .from('expenses')
      .select('id')
      .eq('trip_id', tripId);

    if (tripExpenses && tripExpenses.length > 0) {
      const expenseIds = tripExpenses.map((e: any) => e.id);

      const { error: splitError } = await supabase
        .from('expense_splits')
        .update({ user_id: realUserId })
        .eq('user_id', virtualUserId)
        .in('expense_id', expenseIds);

      if (splitError) throw splitError;
    }

    // 3. 處理 trip_members
    if (existingMember) {
      // 真實用戶已是成員 → 刪除虛擬成員的 trip_member 記錄
      const { error: deleteMemberError } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', virtualUserId);

      if (deleteMemberError) throw deleteMemberError;
    } else {
      // 真實用戶不是成員 → 將虛擬成員的 trip_member 轉移給真實用戶
      const { error: updateMemberError } = await supabase
        .from('trip_members')
        .update({ user_id: realUserId })
        .eq('trip_id', tripId)
        .eq('user_id', virtualUserId);

      if (updateMemberError) throw updateMemberError;
    }

    // 4. 清理虛擬用戶（若無其他 trip 引用）
    const { data: otherTrips } = await supabase
      .from('trip_members')
      .select('id')
      .eq('user_id', virtualUserId)
      .limit(1);

    if (!otherTrips || otherTrips.length === 0) {
      // 也檢查是否還有其他 trip 的 expense 引用
      const { data: otherExpenses } = await supabase
        .from('expenses')
        .select('id')
        .eq('payer_id', virtualUserId)
        .limit(1);

      const { data: otherSplits } = await supabase
        .from('expense_splits')
        .select('id')
        .eq('user_id', virtualUserId)
        .limit(1);

      if (
        (!otherExpenses || otherExpenses.length === 0) &&
        (!otherSplits || otherSplits.length === 0)
      ) {
        await supabase.from('users').delete().eq('id', virtualUserId);
      }
    }

    // 自動登入為真實用戶
    await createSession(realUserId, realUser.username);

    return NextResponse.json({ success: true, message: '連結成功' });
  } catch (error) {
    console.error('Link virtual member error:', error);
    return NextResponse.json({ error: '連結虛擬成員失敗' }, { status: 500 });
  }
}
