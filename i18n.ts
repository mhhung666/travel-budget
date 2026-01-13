import { getRequestConfig } from 'next-intl/server';

// 支持的语言
export const locales = ['en', 'zh'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh';

export default getRequestConfig(async ({ requestLocale }) => {
  // 获取 locale
  let locale = await requestLocale;

  // 验证 locale 参数
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
