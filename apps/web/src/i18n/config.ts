import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale } from './routing';
import type { Locale } from './routing';

// 重新導出供其他模組使用
export { locales, defaultLocale, type Locale };

// next-intl「無 i18n 路由」：網址不帶語言前綴，UI 語系改由 NEXT_LOCALE cookie 決定。
// cookie 由語言切換器（setLocale action）寫入；缺值或不支援的值一律退回預設語系（繁中）。
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
  const locale =
    cookieLocale && locales.includes(cookieLocale as Locale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
