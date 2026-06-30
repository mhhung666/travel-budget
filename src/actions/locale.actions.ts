'use server';

import { cookies } from 'next/headers';
import { dbConnect } from '@/lib/mongodb';
import { User as UserModel } from '@/models';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { locales, defaultLocale, type Locale } from '@/i18n/routing';
import type { ActionResult } from './types';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * 設定 UI 語系（next-intl「無 i18n 路由」模式）。
 *
 * 寫入 NEXT_LOCALE cookie —— 伺服端 getRequestConfig（i18n/config.ts）據此渲染語系，
 * 故首屏即正確、不閃預設語言。若使用者已登入，一併同步 User.locale，讓伺服端寄出的
 * Email / Web Push 通知語系跟著 UI 走（這兩者在背景寄送，讀不到 cookie）。
 * 不支援的值一律退回預設語系。
 */
export async function setLocale(locale: string): Promise<ActionResult<{ locale: Locale }>> {
  try {
    const value: Locale = (locales as readonly string[]).includes(locale)
      ? (locale as Locale)
      : defaultLocale;

    (await cookies()).set('NEXT_LOCALE', value, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    });

    // 已登入才同步通知語系；未登入（如登入頁切語言）只設 cookie。
    const session = await getSession();
    if (session) {
      await dbConnect();
      await UserModel.updateOne({ _id: session.userId }, { $set: { locale: value } });
    }

    return { success: true, data: { locale: value } };
  } catch (error) {
    logger.error('Set locale error', error);
    return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
  }
}
