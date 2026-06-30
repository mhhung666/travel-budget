// 語系清單與預設語系。改用 next-intl「無 i18n 路由」模式後，網址不再帶語言前綴，
// UI 語系改由 NEXT_LOCALE cookie 決定（見 i18n/config.ts），因此這裡不再需要
// defineRouting / localePrefix，也不再有 i18n 中介層。
export const locales = ['en', 'zh', 'zh-CN', 'jp'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh';
