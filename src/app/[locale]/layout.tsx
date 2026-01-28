import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import ThemeRegistry from './ThemeRegistry';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { locales } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // 验证 locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // 获取翻译消息
  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
