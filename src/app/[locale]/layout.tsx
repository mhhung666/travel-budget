import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import ThemeRegistry from './ThemeRegistry';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { locales } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Travel Budget Planner - 旅行記帳',
  description: '輕量化的旅行記帳與分帳應用程式',
  openGraph: {
    title: 'Travel Budget Planner - 旅行記帳',
    description: '輕量化的旅行記帳與分帳應用程式',
    url: 'https://budget.mhhung.com',
    siteName: 'Travel Budget Planner',
    locale: 'zh_TW',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

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
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('theme-mode');if(!m){m=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',m);document.documentElement.style.colorScheme=m}catch(e){}})()`,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `html[data-theme="dark"]{background-color:#0F172A}html[data-theme="light"],html:not([data-theme]){background-color:#F8FAFC}`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeRegistry>{children}</ThemeRegistry>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
