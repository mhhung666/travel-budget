'use client';

import { Clock, UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFriends, useFriendMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * 旅程成員頁的「加好友」按鈕（ROADMAP #12 Phase 1 首選入口：已同遊過、userId 現成）。
 * 依我與該成員的關係渲染四態：無關係（發邀請）/ 邀請已送出（等待）/
 * 對方已邀請我（一鍵接受）/ 已是好友（純標示）。
 * 只在已登入且對象為非虛擬、非自己時由父層掛載；好友資料共用 useFriends 快取。
 */
export function AddFriendButton({ targetUserId }: { targetUserId: string }) {
  const t = useTranslations('friends');
  const { toast } = useToast();
  const { data } = useFriends();
  const { send, accept } = useFriendMutations();

  const relation = data
    ? [...data.friends, ...data.incoming, ...data.outgoing].find((f) => f.user.id === targetUserId)
    : undefined;

  const errorToast = (err: unknown) => {
    const key = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
  };

  const handleSend = () => {
    send.mutate(targetUserId, {
      onSuccess: ({ status }) => {
        // 反向 pending 被自動接受時直接顯示「已成為好友」
        toast({ title: status === 'accepted' ? t('accepted') : t('requestSent') });
      },
      onError: errorToast,
    });
  };

  const handleAccept = () => {
    if (!relation) return;
    accept.mutate(relation.id, {
      onSuccess: () => toast({ title: t('accepted') }),
      onError: errorToast,
    });
  };

  let icon: React.ReactNode;
  let label: string;
  let onClick: (() => void) | undefined;
  let disabled = false;

  if (!relation) {
    icon = <UserPlus className="h-4 w-4" />;
    label = t('addFriend');
    onClick = handleSend;
    disabled = send.isPending;
  } else if (relation.status === 'accepted') {
    icon = <UserCheck className="h-4 w-4" />;
    label = t('alreadyFriends');
    disabled = true;
  } else if (relation.requested_by_me) {
    icon = <Clock className="h-4 w-4" />;
    label = t('requestPending');
    disabled = true;
  } else {
    icon = <UserCheck className="h-4 w-4" />;
    label = t('acceptRequest');
    onClick = handleAccept;
    disabled = accept.isPending;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* disabled 按鈕不觸發 Tooltip，改用 span 包裹維持提示可見 */}
          <span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
              aria-label={label}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
            >
              {icon}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
