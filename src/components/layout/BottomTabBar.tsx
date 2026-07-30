'use client';

import { BarChart3, Compass, Map as MapIcon, ReceiptText, UserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { trackNavigation, type NavigationTarget } from '@/lib/navigationEvents';

/**
 * 行動端底部分頁列（< md 顯示）。
 * - 高頻「記一筆」固定在五欄中央，個人統計作為右側一級入口。
 * - 「我的」涵蓋個人設定與年度回顧（Wrapped 為季節性功能，不佔一級入口）。
 * - safe-area：pb-[env(safe-area-inset-bottom)] 讓 iPhone Home Indicator 不壓內容。
 */
export function BottomTabBar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const tabs = [
    {
      href: '/trips',
      label: t('trips'),
      icon: Compass,
      match: ['/trips'],
      target: 'trips',
    },
    { href: '/map', label: t('map'), icon: MapIcon, match: ['/map'], target: 'map' },
    {
      href: '/stats',
      label: t('stats'),
      icon: BarChart3,
      match: ['/stats'],
      target: 'stats',
    },
    {
      href: '/settings',
      label: t('me'),
      icon: UserRound,
      match: ['/settings', '/wrapped', '/collections', '/memberships'],
      target: 'me',
    },
  ] satisfies {
    href: string;
    label: string;
    icon: typeof Compass;
    match: string[];
    target: NavigationTarget;
  }[];

  const isActive = (match: readonly string[]) =>
    match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <nav
      aria-label={t('bottomNav')}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="grid h-16 grid-cols-5">
        {tabs.slice(0, 2).map((tab) => {
          const active = isActive(tab.match);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => trackNavigation(tab.target, 'mobile_tab')}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => {
            trackNavigation('quick_add', 'mobile_tab');
            onQuickAdd();
          }}
          className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold leading-none text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="-mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <ReceiptText className="h-5 w-5" aria-hidden />
          </span>
          <span className="whitespace-nowrap">{t('quickAdd')}</span>
        </button>
        {tabs.slice(2).map((tab) => {
          const active = isActive(tab.match);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => trackNavigation(tab.target, 'mobile_tab')}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
