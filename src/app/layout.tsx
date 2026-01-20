import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
