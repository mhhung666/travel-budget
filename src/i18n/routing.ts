import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'zh', 'zh-CN', 'jp'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  // 關閉瀏覽器語言自動偵測：未帶語言前綴時一律使用 defaultLocale（繁體中文），
  // 避免 zh-CN 瀏覽器被導向簡體。使用者仍可透過 LanguageSwitcher 切換並以 cookie 記住。
  localeDetection: false,
});
