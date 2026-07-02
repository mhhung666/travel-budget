import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { Toaster } from '@/components/ui/toaster';
import { OfflineBanner } from '@/components/OfflineBanner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Travel Budget Planner - 旅行記帳',
  description: '輕量化的旅行記帳與分帳應用程式',
  icons: {
    icon: '/take-my-money.png',
    shortcut: '/take-my-money.png',
    apple: '/take-my-money.png',
  },
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
    // 與 globals.css 深色 --background(hsl(240 10% 3.9%))同色,避免狀態列與內容色差。
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // UI 語系由 NEXT_LOCALE cookie 決定（見 i18n/config.ts），網址不再帶語言前綴。
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <OfflineBanner />
              {children}
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
