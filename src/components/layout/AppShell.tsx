'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  LogOut,
  Compass,
  Settings,
  BarChart3,
  Map as MapIcon,
  Sparkles,
  Medal,
  Ticket,
  ReceiptText,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { logout } from '@/actions';
import { logger } from '@/lib/logger';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BottomTabBar } from './BottomTabBar';
import { GlobalQuickAddFlow, QUICK_ADD_LAST_TRIP_KEY } from './GlobalQuickAddFlow';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import { trackNavigation } from '@/lib/navigationEvents';

export interface ShellUser {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

/**
 * 登入後的 App Shell：由 (app)/layout.tsx 渲染一次，換頁只換內容區。
 * - 桌機（≥ md）：頂列 = logo + 旅行/地圖/統計 + 記一筆 + 鈴鐺 +「我的」選單。
 * - 行動（< md）：頂列只放 目前位置標題 + 鈴鐺；全域導覽走 BottomTabBar。
 *   個人統計在兩種尺寸皆為一級入口；成就、會籍、回顧與設定歸入「我的」。
 * - 頂列 sticky（非 fixed），內容不再需要 pt-24 魔術數字。
 */
export function AppShell({
  user,
  children,
}: {
  user: ShellUser | null;
  children: React.ReactNode;
}) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [preferredQuickAddTrip, setPreferredQuickAddTrip] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      logger.error('登出失敗', error);
    }
  };

  const primaryNavLinks = [
    { href: '/trips', label: t('trips'), icon: Compass, target: 'trips' },
    { href: '/map', label: t('map'), icon: MapIcon, target: 'map' },
    { href: '/stats', label: t('stats'), icon: BarChart3, target: 'stats' },
  ] as const;

  const personalNavLinks = [
    { href: '/collections', label: t('collections'), icon: Medal, target: 'collections' },
    { href: '/memberships', label: t('memberships'), icon: Ticket, target: 'memberships' },
    { href: '/wrapped', label: t('wrapped'), icon: Sparkles, target: 'wrapped' },
  ] as const;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onQuickAddRoute = pathname === ROUTES.QUICK_ADD;
  const quickAddVisible = user != null && (quickAddOpen || onQuickAddRoute);

  const openQuickAdd = () => {
    try {
      setPreferredQuickAddTrip(localStorage.getItem(QUICK_ADD_LAST_TRIP_KEY));
    } catch {
      setPreferredQuickAddTrip(null);
    }
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setQuickAddOpen(false);
    if (onQuickAddRoute) router.replace(ROUTES.TRIPS);
  };

  // 行程空間（/trips/[id]/*）在行動端由 TripSpaceShell 的頁首取代全域頂列
  // （返回鍵 + 行程名 + 鈴鐺 + 更多選單），避免雙頂列吃掉可視高度。
  const inTripSpace = /^\/trips\/[^/]+/.test(pathname);

  // 行動端頂列標題：目前所在分頁（行程空間內的行程名稱標題屬 Phase 2 分頁殼）。
  const mobileTitle = (() => {
    if (isActive('/map')) return t('map');
    if (isActive('/stats')) return t('stats');
    if (isActive('/collections')) return t('collections');
    if (isActive('/memberships')) return t('memberships');
    if (isActive('/wrapped')) return t('wrapped');
    if (isActive('/settings')) return t('me');
    if (isActive(ROUTES.QUICK_ADD)) return t('quickAdd');
    if (isActive('/trips')) return t('trips');
    return t('home');
  })();

  const displayName = user ? user.display_name || user.username : '';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className={cn(
          'sticky top-0 z-50 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60',
          inTripSpace && 'hidden md:block'
        )}
      >
        <div className="container mx-auto flex h-14 items-center justify-between gap-2 px-4 md:h-16">
          {/* 左側：桌機 logo / 行動端目前位置標題 */}
          <Link href="/trips" className="flex min-w-0 items-center gap-2">
            <Image
              src="/brand-mascot.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 object-contain"
              priority
            />
            <span className="truncate text-lg font-semibold text-foreground md:text-xl">
              <span className="md:hidden">{mobileTitle}</span>
              <span className="hidden md:inline">{t('home')}</span>
            </span>
          </Link>

          {/* 中間：主導覽（桌機）。訪客（未登入）不顯示——連結皆指向需登入頁。 */}
          <nav
            aria-label={t('home')}
            className={cn('absolute left-1/2 hidden -translate-x-1/2 gap-1', user && 'md:flex')}
          >
            {primaryNavLinks.map((link) => (
              <Button
                key={link.href}
                variant="ghost"
                asChild
                className={cn('gap-2', isActive(link.href) && 'bg-accent text-accent-foreground')}
              >
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  onClick={() => trackNavigation(link.target, 'desktop_header')}
                >
                  <link.icon size={20} />
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>

          {/* 右側：鈴鐺（手機/桌機共用）+ 使用者選單（桌機）。訪客改顯示登入按鈕。 */}
          <div className="flex shrink-0 items-center gap-2">
            {!user ? (
              <Button asChild size="sm">
                <Link href="/login">{t('login')}</Link>
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    trackNavigation('quick_add', 'desktop_header');
                    openQuickAdd();
                  }}
                  aria-label={t('quickAdd')}
                  className="hidden gap-2 md:flex"
                >
                  <ReceiptText className="h-4 w-4" aria-hidden />
                  <span className="hidden xl:inline">{t('quickAdd')}</span>
                </Button>
                <NotificationBell />

                <div className="hidden items-center gap-2 md:flex">
                  <span className="mr-1 text-sm text-muted-foreground">{displayName}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label={tCommon('openUserMenu')}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar_url ?? ''} alt={displayName} />
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {personalNavLinks.map((link) => (
                        <DropdownMenuItem
                          key={link.href}
                          onClick={() => {
                            trackNavigation(link.target, 'me_menu');
                            router.push(link.href);
                          }}
                        >
                          <link.icon className="mr-2 h-4 w-4" />
                          <span>{link.label}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          trackNavigation('settings', 'me_menu');
                          router.push('/settings');
                        }}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        <span>{t('settings')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>{t('logout')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 內容區：底部預留 TabBar 高度 + safe-area（桌機無 TabBar） */}
      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">{children}</main>

      {/* 底部分頁列的分頁皆需登入，訪客不顯示。 */}
      {user && <BottomTabBar onQuickAdd={openQuickAdd} />}

      {user && (
        <GlobalQuickAddFlow
          open={quickAddVisible}
          preferredTripId={preferredQuickAddTrip}
          onClose={closeQuickAdd}
        />
      )}
    </div>
  );
}
