'use client';

import { Compass, Map as MapIcon, BarChart3, UserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * 行動端底部分頁列（< md 顯示）。
 * - 「我的」涵蓋個人設定與年度回顧（Wrapped 為季節性功能，不佔一級入口）。
 * - safe-area：pb-[env(safe-area-inset-bottom)] 讓 iPhone Home Indicator 不壓內容。
 */
export function BottomTabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const tabs = [
    { href: '/trips', label: t('trips'), icon: Compass, match: ['/trips'] },
    { href: '/map', label: t('map'), icon: MapIcon, match: ['/map'] },
    { href: '/stats', label: t('stats'), icon: BarChart3, match: ['/stats'] },
    { href: '/settings', label: t('me'), icon: UserRound, match: ['/settings', '/wrapped'] },
  ] as const;

  const isActive = (match: readonly string[]) =>
    match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <nav
      aria-label={t('bottomNav')}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="grid h-16 grid-cols-4">
        {tabs.map((tab) => {
          const active = isActive(tab.match);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-5 w-5" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
