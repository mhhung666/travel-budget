'use client';

import { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Coins,
  MessageSquare,
  Receipt,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ROUTES } from '@/constants/routes';
import {
  useUnreadNotificationCount,
  useNotificationList,
  useNotificationMutations,
  useNotificationPushSync,
} from '@/hooks/queries';
import type { NotificationItem, NotificationType } from '@/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relativeTime';

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  expense_added: Receipt,
  payment_recorded: Coins,
  member_joined: UserPlus,
  expense_comment_added: MessageSquare,
  friend_request: Users,
  friend_accepted: UserCheck,
};

/** 點通知後該去哪：好友 → 設定好友卡片，還款 → 結算頁，支出 → 支出分頁，其餘 → 旅程落點。 */
function targetRoute(n: NotificationItem): string {
  if (n.type === 'friend_request' || n.type === 'friend_accepted') return ROUTES.SETTINGS_FRIENDS;
  if (n.type === 'payment_recorded') return ROUTES.TRIP_SETTLEMENT(n.trip_id);
  if (n.type === 'expense_added' || n.type === 'expense_comment_added')
    return ROUTES.TRIP_EXPENSES(n.trip_id);
  return ROUTES.TRIP_DETAIL(n.trip_id);
}

/**
 * 站內通知鈴鐺（#9 Phase 1）。未讀數以輪詢（見 useUnreadNotificationCount）維持
 * 概略即時，並由 Web Push 即時催更（useNotificationPushSync，#9 Phase 3）；清單在
 * 面板開啟時才載入。訊息文案在此依**收件者語系** + meta 即時組出，故後端只存結構化
 * 資料、不存預先算好的字串。
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = useTranslations('notifications');
  const router = useRouter();

  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading } = useNotificationList(open);
  const { markRead, markAllRead } = useNotificationMutations();
  // 收到 Web Push 時即時 invalidate 未讀數/清單（SW → client 訊息橋接）。
  useNotificationPushSync();

  const renderMessage = (n: NotificationItem): string => {
    const actor = n.actor_name || t('someone');
    switch (n.type) {
      case 'expense_added':
        return t('expenseAdded', { actor, description: n.meta.description ?? '' });
      case 'payment_recorded':
        return t('paymentRecorded', { actor });
      case 'member_joined':
        return t('memberJoined', { actor });
      case 'expense_comment_added':
        return t('expenseCommentAdded', { actor, description: n.meta.description ?? '' });
      case 'friend_request':
        return t('friendRequest', { actor });
      case 'friend_accepted':
        return t('friendAccepted', { actor });
      default:
        return actor;
    }
  };

  const handleClick = (n: NotificationItem) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    router.push(targetRoute(n));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-foreground"
          aria-label={t('title')}
        >
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">{t('title')}</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-2 py-1 text-xs text-muted-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('markAllRead')}
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent',
                        !n.read && 'bg-accent/40'
                      )}
                    >
                      <span className="mt-0.5 shrink-0 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{renderMessage(n)}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {n.trip_name
                            ? `${n.trip_name} · ${formatRelativeTime(n.created_at, locale)}`
                            : formatRelativeTime(n.created_at, locale)}
                        </span>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
