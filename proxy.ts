import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/auth';
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

// 建立 i18n middleware
const i18nMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});

// 定義需要認證的路由（不包含 locale 前綴）
const protectedRoutes = ['/trips', '/settings'];

// 定義已登入用戶不應訪問的路由（如登入頁）
const authRoutes = ['/login'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 首先運行 i18n middleware
  const i18nResponse = i18nMiddleware(request);

  // 獲取處理後的 pathname（移除 locale 前綴）
  let pathWithoutLocale = pathname;
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.slice(locale.length + 1) || '/';
      break;
    }
  }

  // 獲取當前用戶的 session
  const session = await getSessionFromRequest(request);

  // 情況 1: 已登入用戶訪問登入頁面 → 重定向到 /trips
  if (session && authRoutes.includes(pathWithoutLocale)) {
    return NextResponse.redirect(new URL('/trips', request.url));
  }

  // 情況 2: 未登入用戶訪問受保護頁面 → 重定向到 /login
  if (!session && protectedRoutes.includes(pathWithoutLocale)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 返回 i18n middleware 的響應
  return i18nResponse;
}

// 配置 proxy 要匹配的路徑
export const config = {
  matcher: [
    /*
     * 匹配所有路徑除了：
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
