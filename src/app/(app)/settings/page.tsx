'use client';

import {
  BarChart3,
  Bell,
  ChevronRight,
  Lock,
  LogOut,
  Medal,
  Palette,
  Sparkles,
  Ticket,
  User,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { logout } from '@/actions';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/queries';
import { logger } from '@/lib/logger';
import { trackNavigation, type NavigationTarget } from '@/lib/navigationEvents';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * 「我的」（UI/UX 重設計 5.5）：由 588 行單頁平鋪改為列表式選單，
 * 每項進入獨立子頁（個人資料／修改密碼／通知／外觀），行動端捲動地獄消失。
 * 年度回顧與登出維持在此（自舊漢堡選單移入）。
 */
export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tNav = useTranslations('nav');
  const tFriends = useTranslations('friends');

  const { data: user, isLoading } = useCurrentUser();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      logger.error('登出失敗', error);
    }
  };

  const openPersonalPage = (target: NavigationTarget, href: string) => {
    trackNavigation(target, 'me_menu');
    router.push(href);
  };

  const items: { icon: LucideIcon; label: string; href: string }[] = [
    { icon: User, label: t('profile.title'), href: ROUTES.SETTINGS_ACCOUNT },
    { icon: Users, label: tFriends('title'), href: ROUTES.SETTINGS_FRIENDS },
    { icon: Lock, label: t('password.title'), href: ROUTES.SETTINGS_SECURITY },
    { icon: Bell, label: t('notifications.title'), href: ROUTES.SETTINGS_NOTIFICATIONS },
    { icon: Palette, label: t('appearance.title'), href: ROUTES.SETTINGS_APPEARANCE },
  ];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 pb-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t('title')}</h1>

      {/* 頭像 + 名稱（點擊進個人資料） */}
      <Link
        href={ROUTES.SETTINGS_ACCOUNT}
        className="mb-6 flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
      >
        {isLoading ? (
          <>
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </>
        ) : (
          <>
            <Avatar className="h-14 w-14">
              <AvatarImage src={user?.avatar_url ?? ''} alt={user?.display_name ?? ''} />
              <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                {(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate text-base font-medium text-foreground">
                {user?.display_name}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                @{user?.username}
              </span>
            </span>
            <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
          </>
        )}
      </Link>

      {/* 設定選單 */}
      <Card>
        <CardContent className="p-2">
          {items.map((item, i) => (
            <div key={item.href}>
              {i > 0 && <Separator />}
              <Link
                href={item.href}
                className="flex h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <item.icon className="h-4 w-4 text-primary" />
                {item.label}
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 旅行成就 + 年度回顧 + 登出（行動端無頂列導覽，這裡是主要進場點） */}
      <Card className="mt-6">
        <CardContent className="space-y-1 p-2">
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-3 px-3"
            onClick={() => openPersonalPage('stats', ROUTES.STATS)}
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            {tNav('stats')}
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-3 px-3"
            onClick={() => openPersonalPage('collections', ROUTES.COLLECTIONS)}
          >
            <Medal className="h-4 w-4 text-primary" />
            {tNav('collections')}
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-3 px-3"
            onClick={() => openPersonalPage('memberships', ROUTES.MEMBERSHIPS)}
          >
            <Ticket className="h-4 w-4 text-primary" />
            {tNav('memberships')}
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-3 px-3"
            onClick={() => openPersonalPage('wrapped', ROUTES.WRAPPED)}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {tNav('wrapped')}
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-3 px-3 text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {tNav('logout')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
