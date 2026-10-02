import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import mongoose, { isValidObjectId } from 'mongoose';
import { changeMemberIdentity, MemberIdentityError } from '@/lib/memberIdentity';
import { Trip, User } from '@/models';
import { createSession } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { PublicApiError, apiError } from '@/lib/publicApiError';
import { withPublicTrip } from '@/lib/withPublicTrip';

// 不分大小寫的精確比對（取代 Postgres ilike）
const CI = { locale: 'en', strength: 2 } as const;

/**
 * 將虛擬成員連結到已存在的會員（登入後遷移資料）
 * POST /api/public/trips/[id]/link-member
 * Body: { virtualUserId, username, password }
 */
export const POST = withPublicTrip(
  async ({ request, tripId, params }) => {
    const body = await request.json();
    const { virtualUserId, username, password } = body;

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

    // 驗證登入資料
    const validation = loginSchema.safeParse({ username, password });
    if (!validation.success) {
      return apiError(PublicApiError.VALIDATION_ERROR, 400);
    }

    // 查找目標真實用戶
    const realUser = await User.findOne({ username: validation.data.username })
      .collation(CI)
      .select('username password isVirtual');

    if (!realUser) {
      return apiError(PublicApiError.INVALID_CREDENTIALS, 401);
    }
    if (realUser.isVirtual) {
      return apiError(PublicApiError.CANNOT_LINK_VIRTUAL, 400);
    }

    // 驗證密碼
    const isPasswordValid = await bcrypt.compare(validation.data.password, realUser.password);
    if (!isPasswordValid) {
      return apiError(PublicApiError.INVALID_CREDENTIALS, 401);
    }

    const realUserId = realUser._id.toString();

    // 檢查真實用戶是否已是此 trip 的成員
    const existingMember = await Trip.exists({ _id: tripId, 'members.user': realUserId });
    if (existingMember) {
      return apiError(PublicApiError.ALREADY_MEMBER, 409);
    }

    try {
      await changeMemberIdentity(mongoose.connection.db!, {
        tripId,
        virtualUserId,
        hashCode: params.id,
        kind: 'link',
        realUserId,
        passwordHash: realUser.password,
      });
    } catch (error) {
      if (error instanceof MemberIdentityError) return apiError(error.code, error.status);
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
        return apiError(
          error.keyPattern?.email ? PublicApiError.EMAIL_TAKEN : PublicApiError.USERNAME_TAKEN,
          409
        );
      }
      throw error;
    }

    // 自動登入為真實用戶
    await createSession(realUserId, realUser.username);

    return NextResponse.json({ success: true, message: '連結成功' });
  },
  { logLabel: 'Link virtual member error' }
);
