'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbConnect } from '@/lib/mongodb';
import { User as UserModel, PasswordResetCode, EmailChangeCode } from '@/models';
import { createSession, deleteSession, getSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { buildPasswordResetEmail, buildEmailChangeEmail } from '@/lib/emailTemplates';
import {
  loginSchema,
  notificationPrefsSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  updateProfileSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
  type LoginInput,
  type RegisterInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type ConfirmEmailChangeInput,
} from '@/lib/validation';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { User } from '@/types';
import { logger } from '@/lib/logger';

// Email 驗證碼（忘記密碼 + 變更 Email 共用）：6 位數、15 分鐘有效、最多 5 次驗證嘗試。
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_EXPIRES_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;

/** 產生 6 位數驗證碼（含前導零）。 */
function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 驗證碼雜湊（不存明碼）。短效 + 次數上限已足以防暴力，sha256 即可、無 bcrypt 成本。 */
function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export type AuthUser = Pick<User, 'id' | 'username' | 'display_name'>;
export type AuthUserWithCreatedAt = AuthUser & {
  created_at: string;
  email: string;
  avatar_url: string | null;
  notify_by_email: boolean;
};

// 不分大小寫的精確比對（取代 Postgres ilike）
const CI = { locale: 'en', strength: 2 } as const;

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<ActionResult<AuthUserWithCreatedAt | null>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: true, data: null };
    }

    await dbConnect();
    const user = await UserModel.findById(session.userId)
      .select('username displayName email createdAt avatarUrl notifyByEmail')
      .lean();

    if (!user) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        created_at: user.createdAt.toISOString(),
        avatar_url: user.avatarUrl ?? null,
        // 缺值（舊資料）視為開啟，與 notify() 的 `!== false` 判定一致。
        notify_by_email: user.notifyByEmail !== false,
      },
    };
  } catch (error) {
    logger.error('Get current user error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Login user
 */
export async function login(input: LoginInput): Promise<ActionResult<AuthUser>> {
  try {
    const validation = loginSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { username, password } = validation.data;

    await dbConnect();
    const user = await UserModel.findOne({ username }).collation(CI);

    if (!user) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' };
    }

    await createSession(user._id.toString(), user.username);

    return {
      success: true,
      data: {
        id: user._id.toString(),
        username: user.username,
        display_name: user.displayName,
      },
    };
  } catch (error) {
    logger.error('Login error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Register new user
 */
export async function register(input: RegisterInput): Promise<ActionResult<AuthUser>> {
  try {
    const validation = registerSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { username, display_name, email, password } = validation.data;

    await dbConnect();

    // Check if username exists (case-insensitive)
    const existingUsername = await UserModel.findOne({ username }).collation(CI).select('_id');
    if (existingUsername) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }

    // Check if email exists (case-insensitive)
    const existingEmail = await UserModel.findOne({ email }).collation(CI).select('_id');
    if (existingEmail) {
      return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await UserModel.create({
      username,
      displayName: display_name,
      email,
      password: hashedPassword,
    });

    await createSession(newUser._id.toString(), username);

    return {
      success: true,
      data: {
        id: newUser._id.toString(),
        username: newUser.username,
        display_name: newUser.displayName,
      },
    };
  } catch (error) {
    logger.error('Registration error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<ActionResult<{ message: string }>> {
  try {
    await deleteSession();
    return { success: true, data: { message: '登出成功' } };
  } catch (error) {
    logger.error('Logout error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * Update user profile
 */
export const updateProfile = withAuth(
  async (session, input: UpdateProfileInput): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = updateProfileSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { display_name, current_password, new_password } = validation.data;

      await dbConnect();

      // Update display name（Email 變更改走 requestEmailChange / confirmEmailChange 寄碼驗證流程）
      if (display_name !== undefined) {
        await UserModel.updateOne(
          { _id: session.userId },
          { $set: { displayName: display_name.trim() } }
        );

        return { success: true, data: { message: '個人資料已更新' } };
      }

      // Update password
      if (current_password && new_password) {
        const user = await UserModel.findById(session.userId).select('password');

        if (!user) {
          return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
        }

        const isPasswordValid = await bcrypt.compare(current_password, user.password);
        if (!isPasswordValid) {
          return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await UserModel.updateOne({ _id: session.userId }, { $set: { password: hashedPassword } });

        return { success: true, data: { message: '密碼已更新' } };
      }

      return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
    } catch (error) {
      logger.error('Update user error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 更新通知偏好（目前：Email 通知開關 + 寄信語系）。
 * 站內通知一律保留（不可關），Email 為 opt-out。`locale` 由設定頁帶入當前 UI 語系，
 * 供 notify() 的 Email fan-out 決定寄信語系（站內通知仍靠前端依檢視者語系渲染）。
 */
export const updateNotificationPrefs = withAuth(
  async (
    session,
    input: { notify_by_email: boolean; locale?: string }
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = notificationPrefsSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { notify_by_email, locale } = validation.data;
      const updateData: Record<string, unknown> = { notifyByEmail: notify_by_email };
      if (locale !== undefined) updateData.locale = locale;

      await dbConnect();
      await UserModel.updateOne({ _id: session.userId }, { $set: updateData });
      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Update notification prefs error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 忘記密碼 — 步驟一：以 Email 索取驗證碼。
 *
 * 安全性：**不洩漏 Email 是否存在** —— 無論帳號是否存在皆回傳相同的成功結果（信箱
 * 存在時才實際寄碼）。每位使用者最多一筆有效碼（upsert 覆寫，重新索取即作廢前一組）。
 * 寄信為 best-effort：未配置 Resend 時，非 production 會把碼寫進 log 以便本機測試。
 */
export async function requestPasswordReset(
  input: RequestPasswordResetInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const validation = requestPasswordResetSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { email, locale } = validation.data;

    await dbConnect();
    const user = await UserModel.findOne({ email }).collation(CI).select('email locale');

    // 帳號存在才產碼寄信；不存在則靜默（回傳一致成功，避免列舉信箱）。
    if (user?.email) {
      const code = generateVerificationCode();
      await PasswordResetCode.findOneAndUpdate(
        { user: user._id },
        {
          codeHash: hashVerificationCode(code),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        },
        { upsert: true }
      );

      const content = await buildPasswordResetEmail({
        code,
        locale: locale ?? user.locale ?? 'zh',
        expiresMinutes: CODE_EXPIRES_MINUTES,
      });
      const sent = await sendEmail({ to: user.email, content });
      if (!sent && process.env.NODE_ENV !== 'production') {
        // 本機 / 未配置 Resend：把碼印到 log 方便測試（production 不印）。
        logger.info(`[dev] password reset code for ${user.email}: ${code}`);
      }
    }

    return { success: true, data: { message: 'OK' } };
  } catch (error) {
    logger.error('Request password reset error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * 忘記密碼 — 步驟二：以 Email + 驗證碼重設密碼。
 *
 * 失敗一律回傳 VALIDATION_ERROR 並以穩定的 error token（INVALID_CODE / CODE_EXPIRED /
 * TOO_MANY_ATTEMPTS）讓前端對應本地化訊息——同樣不區分「信箱不存在」與「碼錯誤」以免列舉。
 * 成功後刪除該驗證碼（一次性）。
 */
export async function resetPassword(
  input: ResetPasswordInput
): Promise<ActionResult<{ message: string }>> {
  try {
    const validation = resetPasswordSchema.safeParse(input);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error.issues[0].message,
        code: 'VALIDATION_ERROR',
      };
    }

    const { email, code, new_password } = validation.data;

    await dbConnect();
    const user = await UserModel.findOne({ email }).collation(CI).select('_id');
    const record = user ? await PasswordResetCode.findOne({ user: user._id }) : null;

    // 信箱不存在或無有效碼：一律當成「碼無效」回應（不洩漏信箱是否存在）。
    if (!user || !record) {
      return { success: false, error: 'INVALID_CODE', code: 'VALIDATION_ERROR' };
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await PasswordResetCode.deleteOne({ _id: record._id });
      return { success: false, error: 'CODE_EXPIRED', code: 'VALIDATION_ERROR' };
    }

    if ((record.attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
      await PasswordResetCode.deleteOne({ _id: record._id });
      return { success: false, error: 'TOO_MANY_ATTEMPTS', code: 'VALIDATION_ERROR' };
    }

    if (record.codeHash !== hashVerificationCode(code)) {
      await PasswordResetCode.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      return { success: false, error: 'INVALID_CODE', code: 'VALIDATION_ERROR' };
    }

    // 驗證通過：更新密碼並作廢驗證碼（一次性）。
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
    await PasswordResetCode.deleteOne({ _id: record._id });

    return { success: true, data: { message: '密碼已重設成功' } };
  } catch (error) {
    logger.error('Reset password error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}

/**
 * 變更 Email — 步驟一：寄驗證碼到「新信箱」以確認其屬本人。
 *
 * 與忘記密碼不同，這裡使用者已登入、操作的是自己的帳號，故會直接回報「信箱已被占用 /
 * 與現用相同」等狀態（無列舉風險——本就是登入者主動變更自己的信箱）。每位使用者最多一筆
 * 待驗證變更（user 唯一 + upsert 覆寫），重新索取即作廢前一組碼，可換不同新信箱。
 * 寄信為 best-effort：未配置 Resend 時，非 production 會把碼寫進 log 以便本機測試。
 */
export const requestEmailChange = withAuth(
  async (
    session,
    input: { new_email: string; locale?: string }
  ): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = requestEmailChangeSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { new_email, locale } = validation.data;
      const normalizedEmail = new_email.toLowerCase().trim();

      await dbConnect();

      const me = await UserModel.findById(session.userId).select('email locale');
      if (!me) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      // 與目前信箱相同：無需變更。
      if (me.email && me.email.toLowerCase() === normalizedEmail) {
        return { success: false, error: 'SAME_EMAIL', code: 'VALIDATION_ERROR' };
      }

      // 已被其他帳號占用（不分大小寫，排除自己）。
      const existingEmail = await UserModel.findOne({
        email: normalizedEmail,
        _id: { $ne: session.userId },
      })
        .collation(CI)
        .select('_id');
      if (existingEmail) {
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
      }

      const code = generateVerificationCode();
      await EmailChangeCode.findOneAndUpdate(
        { user: session.userId },
        {
          newEmail: normalizedEmail,
          codeHash: hashVerificationCode(code),
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        },
        { upsert: true }
      );

      const content = await buildEmailChangeEmail({
        code,
        locale: locale ?? me.locale ?? 'zh',
        expiresMinutes: CODE_EXPIRES_MINUTES,
      });
      const sent = await sendEmail({ to: normalizedEmail, content });
      if (!sent && process.env.NODE_ENV !== 'production') {
        // 本機 / 未配置 Resend：把碼印到 log 方便測試（production 不印）。
        logger.info(`[dev] email change code for ${normalizedEmail}: ${code}`);
      }

      return { success: true, data: { message: 'OK' } };
    } catch (error) {
      logger.error('Request email change error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 變更 Email — 步驟二：以寄到新信箱的 6 位數驗證碼套用變更。
 *
 * 失敗以穩定的 error token（INVALID_CODE / CODE_EXPIRED / TOO_MANY_ATTEMPTS）讓前端對應
 * 本地化訊息。套用前再查一次新信箱是否在這段期間被別人占用（避免競態）；成功後刪除驗證碼
 * （一次性）。
 */
export const confirmEmailChange = withAuth(
  async (session, input: ConfirmEmailChangeInput): Promise<ActionResult<{ message: string }>> => {
    try {
      const validation = confirmEmailChangeSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { code } = validation.data;

      await dbConnect();
      const record = await EmailChangeCode.findOne({ user: session.userId });
      if (!record) {
        return { success: false, error: 'INVALID_CODE', code: 'VALIDATION_ERROR' };
      }

      if (record.expiresAt.getTime() < Date.now()) {
        await EmailChangeCode.deleteOne({ _id: record._id });
        return { success: false, error: 'CODE_EXPIRED', code: 'VALIDATION_ERROR' };
      }

      if ((record.attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
        await EmailChangeCode.deleteOne({ _id: record._id });
        return { success: false, error: 'TOO_MANY_ATTEMPTS', code: 'VALIDATION_ERROR' };
      }

      if (record.codeHash !== hashVerificationCode(code)) {
        await EmailChangeCode.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        return { success: false, error: 'INVALID_CODE', code: 'VALIDATION_ERROR' };
      }

      // 套用前再確認新信箱未在期間內被別人占用（競態保護）。
      const existingEmail = await UserModel.findOne({
        email: record.newEmail,
        _id: { $ne: session.userId },
      })
        .collation(CI)
        .select('_id');
      if (existingEmail) {
        await EmailChangeCode.deleteOne({ _id: record._id });
        return { success: false, error: 'CONFLICT', code: 'CONFLICT' };
      }

      // 驗證通過：套用新信箱並作廢驗證碼（一次性）。
      await UserModel.updateOne({ _id: session.userId }, { $set: { email: record.newEmail } });
      await EmailChangeCode.deleteOne({ _id: record._id });

      return { success: true, data: { message: 'Email 已更新' } };
    } catch (error) {
      logger.error('Confirm email change error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
