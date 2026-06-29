'use client';

import { useLocale, useTranslations } from 'next-intl';
import { History, Coins, FilePenLine, Receipt, Trash2, UserPlus } from 'lucide-react';
import { useActivityLog } from '@/hooks/queries';
import type { ActivityLogItem, ActivityLogType } from '@/types';
import { formatRelativeTime } from '@/lib/relativeTime';

const TYPE_ICON: Record<ActivityLogType, typeof History> = {
  expense_added: Receipt,
  expense_updated: FilePenLine,
  expense_deleted: Trash2,
  payment_recorded: Coins,
  member_joined: UserPlus,
};

/**
 * 旅程動態牆（#8）。trip-scoped 共享時間軸，呈現「誰改了什麼」（含檢視者本人的動作）。
 * 訊息文案在此依**檢視者語系** + meta 即時組出，故後端只存結構化資料、不存字串。
 */
export function ActivityFeed({ tripId }: { tripId: string }) {
  const locale = useLocale();
  const t = useTranslations('activity');
  const { data: items = [], isLoading } = useActivityLog(tripId);

  const renderMessage = (a: ActivityLogItem): string => {
    const actor = a.actor_name || t('someone');
    const description = a.meta.description ?? '';
    switch (a.type) {
      case 'expense_added':
        return t('expenseAdded', { actor, description });
      case 'expense_updated':
        return t('expenseUpdated', { actor, description });
      case 'expense_deleted':
        return t('expenseDeleted', { actor, description });
      case 'payment_recorded':
        return t('paymentRecorded', { actor });
      case 'member_joined':
        return t('memberJoined', { actor });
      default:
        return actor;
    }
  };

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('loading')}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <History className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map((a) => {
        const Icon = TYPE_ICON[a.type] ?? History;
        return (
          <li key={a.id} className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-accent/50">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug">{renderMessage(a)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatRelativeTime(a.created_at, locale)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
