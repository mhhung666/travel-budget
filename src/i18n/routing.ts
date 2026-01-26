import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'zh', 'zh-CN', 'jp'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});
