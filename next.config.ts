import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import packageJson from './package.json';

const withNextIntl = createNextIntlPlugin('./src/i18n/config.ts');

/**
 * Serwist service worker (PWA offline-first, ROADMAP #5 Phase 1).
 * - `swSrc` compiled to `public/sw.js` (gitignored build artifact).
 * - Disabled in dev: Serwist doesn't support Turbopack, so local PWA testing
 *   needs `pnpm dev --webpack`. Production build is unaffected.
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/**
 * 基本安全標頭（IMPROVEMENTS H），套用於所有路由：
 * - 防點擊劫持（`X-Frame-Options` + CSP `frame-ancestors`）、MIME 嗅探、referrer 外洩。
 * - HSTS 只在 production 送出（本機 http 不送）。
 *
 * 完整 CSP（`default-src`/`script-src`…）**刻意未上**：需配合 Leaflet 圖磚、R2 圖片/PDF、
 * next-themes 內嵌腳本與 Radix 內嵌樣式實測，屬後續工作。此處 CSP 僅含 `frame-ancestors`，
 * 不限制其他資源，故不會誤擋既有功能。
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  });
}

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: packageJson.version,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  /**
   * 行程分頁自 /trips/[id]/itinerary 移到行程空間落點 /trips/[id]（分頁列第一顆）。
   * 舊連結（書籤、既有通知/Email、PWA 捷徑）仍會指過來，故保留永久轉址。
   * 用 config 轉址而非頁面內 redirect()：後者在 App Router 會軟導向（回 200、網址不變）。
   */
  async redirects() {
    return [{ source: '/trips/:id/itinerary', destination: '/trips/:id', permanent: true }];
  },
};

export default withSerwist(withNextIntl(nextConfig));
