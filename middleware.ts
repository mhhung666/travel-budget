import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './src/lib/auth';
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './src/i18n/config';

// 建立 i18n middleware
const i18nMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: false,
});

// 定義需要認證的路由（不包含 locale 前綴）
const protectedRoutes = ['/trips', '/settings'];

// 定義已登入用戶不應訪問的路由（如登入頁）
const authRoutes = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 首先運行 i18n middleware
  const i18nResponse = i18nMiddleware(request);

  // 獲取處理後的 pathname（移除 locale 前綴）並記錄當前 locale
  let pathWithoutLocale = pathname;
  let currentLocale: string = defaultLocale;

  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      currentLocale = locale;
      pathWithoutLocale = pathname.slice(locale.length + 1) || '/';
      break;
    }
  }

  // 構建帶有 locale 的路徑（預設語言不需要前綴）
  const getLocalizedPath = (path: string) => {
    return currentLocale === defaultLocale ? path : `/${currentLocale}${path}`;
  };

  // 獲取當前用戶的 session
  const session = await getSessionFromRequest(request);

  // 情況 1: 已登入用戶訪問登入頁面 → 重定向到 /trips（保留語言設定）
  if (session && authRoutes.includes(pathWithoutLocale)) {
    return NextResponse.redirect(new URL(getLocalizedPath('/trips'), request.url));
  }

  // 情況 2: 未登入用戶訪問受保護頁面 → 重定向到 /login（保留語言設定）
  if (!session && protectedRoutes.includes(pathWithoutLocale)) {
    return NextResponse.redirect(new URL(getLocalizedPath('/login'), request.url));
  }

  // 返回 i18n middleware 的響應
  return i18nResponse;
}

// 配置 middleware 要匹配的路徑
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
