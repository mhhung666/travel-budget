import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isValidObjectId } from 'mongoose';
import { Trip, User } from '@/models';
import { getTripIdByHashCode } from '@/lib/permissions';
import { createSession } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { PublicApiError, apiError } from '@/lib/publicApiError';

// 不分大小寫的精確比對（取代 Postgres ilike）
const CI = { locale: 'en', strength: 2 } as const;

/**
 * 將虛擬成員轉換為正式會員（註冊）
 * POST /api/public/trips/[id]/convert-member
 * Body: { virtualUserId, username, display_name, email, password }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { virtualUserId, username, display_name, email, password } = body;

    // 驗證 trip 存在
    const tripId = await getTripIdByHashCode(id);
    if (!tripId) {
      return apiError(PublicApiError.NOT_FOUND, 404);
    }

    // 驗證 virtualUserId（ObjectId 字串）
    if (!virtualUserId || typeof virtualUserId !== 'string' || !isValidObjectId(virtualUserId)) {
      return apiError(PublicApiError.INVALID_VIRTUAL_ID, 400);
    }

    // 驗證目標用戶是虛擬成員
    const virtualUser = await User.findById(virtualUserId).select('isVirtual').lean<{
      isVirtual?: boolean | null;
    } | null>();

    if (!virtualUser) {
      return apiError(PublicApiError.USER_NOT_FOUND, 404);
    }
    if (!virtualUser.isVirtual) {
      return apiError(PublicApiError.NOT_VIRTUAL, 400);
    }

    // 驗證該虛擬成員屬於此 trip
    const memberCheck = await Trip.exists({ _id: tripId, 'members.user': virtualUserId });
    if (!memberCheck) {
      return apiError(PublicApiError.NOT_TRIP_MEMBER, 400);
    }

    // 驗證註冊資料
    const validation = registerSchema.safeParse({ username, display_name, email, password });
    if (!validation.success) {
      return apiError(PublicApiError.VALIDATION_ERROR, 400);
    }

    // 檢查 username 唯一性（排除自身）
    const existingUsername = await User.findOne({ username, _id: { $ne: virtualUserId } })
      .collation(CI)
      .select('_id');
    if (existingUsername) {
      return apiError(PublicApiError.USERNAME_TAKEN, 409);
    }

    // 檢查 email 唯一性（排除自身）
    const existingEmail = await User.findOne({ email, _id: { $ne: virtualUserId } })
      .collation(CI)
      .select('_id');
    if (existingEmail) {
      return apiError(PublicApiError.EMAIL_TAKEN, 409);
    }

    // 更新虛擬用戶為正式會員
    const hashedPassword = await bcrypt.hash(password, 10);

    await User.updateOne(
      { _id: virtualUserId },
      {
        $set: {
          username: validation.data.username,
          displayName: validation.data.display_name,
          email: validation.data.email.toLowerCase().trim(),
          password: hashedPassword,
          isVirtual: false,
        },
      }
    );

    // 自動登入
    await createSession(virtualUserId, validation.data.username);

    return NextResponse.json({ success: true, message: '註冊成功' });
  } catch (error) {
    logger.error('Convert virtual member error', error);
    return apiError(PublicApiError.INTERNAL_ERROR, 500);
  }
}
