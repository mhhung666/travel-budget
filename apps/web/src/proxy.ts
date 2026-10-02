import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/auth';
import { PROTECTED_ROUTES, AUTH_ROUTES } from './constants/routes';

// 需認證 / 登入導向的路由清單單一來源見 constants/routes.ts。
// 比對為「完整路徑精確相符」，故 '/wrapped' 只保護回顧頁本身，
// '/wrapped/share/[code]/[year]' 多了路徑段不相符 → 維持公開
// （與 '/map' vs '/map/share' 同樣的切分）。

// 網址不再帶語言前綴（UI 語系改由 NEXT_LOCALE cookie 決定，見 i18n/config.ts），
// 因此中介層不再掛 next-intl i18n middleware，只負責認證導向。
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 獲取當前用戶的 session
  const session = await getSessionFromRequest(request);

  // 情況 1: 已登入用戶訪問登入頁面 → 重定向到 /trips
  if (session && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/trips', request.url));
  }

  // 情況 2: 未登入用戶訪問受保護頁面 → 重定向到 /login
  if (!session && PROTECTED_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// 配置 middleware 要匹配的路徑
export const config = {
  matcher: [
    /*
     * 匹配所有路徑除了：
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - _vercel (vercel files)
     * - 所有靜態檔案（帶副檔名的檔案，如 .png, .jpg, .svg 等）
     */
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
