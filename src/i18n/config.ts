import { getRequestConfig } from 'next-intl/server';
import { routing, locales, defaultLocale } from './routing';
import type { Locale } from './routing';

// 重新導出供其他模組使用
export { locales, defaultLocale, type Locale };

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
