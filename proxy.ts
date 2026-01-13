import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/auth';

// 定義需要認證的路由
const protectedRoutes = ['/trips', '/settings'];

// 定義已登入用戶不應訪問的路由（如登入頁）
const authRoutes = ['/login'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 獲取當前用戶的 session
  const session = await getSessionFromRequest(request);

  // 情況 1: 已登入用戶訪問登入頁面 → 重定向到 /trips
  if (session && authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL('/trips', request.url));
  }

  // 情況 2: 未登入用戶訪問受保護頁面 → 重定向到 /login
  if (!session && protectedRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 其他情況：允許請求繼續
  return NextResponse.next();
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
