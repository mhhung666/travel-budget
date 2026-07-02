'use client';

import { Compass } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';

/**
 * 免登入分享/邀請頁的唯讀殼：logo + 語言/主題切換 + 登入 CTA。
 * 已登入者 CTA 改為「我的旅行」。由 (public)/layout.tsx 渲染。
 */
export function PublicShell({
  loggedIn,
  children,
}: {
  loggedIn: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('nav');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Compass className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate text-lg font-semibold text-foreground">{t('home')}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="ml-1">
              <Link href={loggedIn ? '/trips' : '/login'}>
                {loggedIn ? t('trips') : t('login')}
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-[env(safe-area-inset-bottom)]">{children}</main>
    </div>
  );
}
