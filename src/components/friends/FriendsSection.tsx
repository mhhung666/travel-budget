'use client';

import { Check, Loader2, UserMinus, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FriendItem } from '@/types';
import { useFriends, useFriendMutations } from '@/hooks/queries';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';

import { ConfirmDialog } from '@/components/common';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** 好友 / 邀請共用的一列：頭像 + 名稱 + 右側操作 */
function FriendRow({ item, actions }: { item: FriendItem; actions: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Avatar className="h-10 w-10">
        <AvatarImage src={item.user.avatar_url ?? ''} alt={item.user.display_name} />
        <AvatarFallback className="bg-primary font-medium text-primary-foreground">
          {item.user.display_name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.user.display_name}</p>
        <p className="truncate text-xs text-muted-foreground">@{item.user.username}</p>
      </div>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </div>
  );
}

/**
 * 「我的」好友管理卡片（ROADMAP #12 Phase 1）：好友列表 + pending 收件匣
 * （接受 / 拒絕）+ 送出邀請（收回）。Phase 2 通知上線前，這裡是收件者
 * 唯一能看到邀請的地方。
 */
export function FriendsSection() {
  const t = useTranslations('friends');
  const { toast } = useToast();
  const { data, isLoading } = useFriends();
  const { accept, decline, remove } = useFriendMutations();
  const removeDialog = useDialog<FriendItem>();

  const errorToast = (err: unknown) => {
    const key = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
  };

  const handleAccept = (item: FriendItem) => {
    accept.mutate(item.id, {
      onSuccess: () => toast({ title: t('accepted') }),
      onError: errorToast,
    });
  };

  // 拒絕（收到的邀請）與收回（送出的邀請）走同一個 action，只差在提示文字
  const handleDecline = (item: FriendItem) => {
    decline.mutate(item.id, {
      onSuccess: () => toast({ title: item.requested_by_me ? t('canceled') : t('declined') }),
      onError: errorToast,
    });
  };

  const handleRemove = () => {
    const item = removeDialog.data;
    if (!item) return;
    remove.mutate(item.id, {
      onSuccess: () => {
        toast({ title: t('removed') });
        removeDialog.closeDialog();
      },
      onError: (err) => {
        errorToast(err);
        removeDialog.closeDialog();
      },
    });
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  const { friends, incoming, outgoing } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* 收到的邀請 */}
      {incoming.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">{t('incomingTitle')}</CardTitle>
              <Badge variant="default" className="min-w-[1.5rem] justify-center px-2 py-0.5">
                {incoming.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {incoming.map((item) => (
              <FriendRow
                key={item.id}
                item={item}
                actions={
                  <>
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={accept.isPending || decline.isPending}
                      onClick={() => handleAccept(item)}
                    >
                      <Check className="h-4 w-4" />
                      {t('accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={accept.isPending || decline.isPending}
                      onClick={() => handleDecline(item)}
                    >
                      <X className="h-4 w-4" />
                      {t('decline')}
                    </Button>
                  </>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 好友列表 */}
      <Card>
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">{t('listTitle')}</CardTitle>
            <Badge variant="secondary" className="min-w-[1.5rem] justify-center px-2 py-0.5">
              {friends.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {friends.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8" />
              <p>{t('empty')}</p>
            </div>
          ) : (
            friends.map((item) => (
              <FriendRow
                key={item.id}
                item={item}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t('remove')}
                    onClick={() => removeDialog.openDialog(item)}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* 送出的邀請 */}
      {outgoing.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">{t('outgoingTitle')}</CardTitle>
              <Badge variant="secondary" className="min-w-[1.5rem] justify-center px-2 py-0.5">
                {outgoing.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {outgoing.map((item) => (
              <FriendRow
                key={item.id}
                item={item}
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={decline.isPending}
                    onClick={() => handleDecline(item)}
                  >
                    {decline.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    {t('cancel')}
                  </Button>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={removeDialog.open}
        title={t('confirmRemove.title')}
        message={t('confirmRemove.message', {
          name: removeDialog.data?.user.display_name ?? '',
        })}
        severity="error"
        confirmText={t('remove')}
        cancelText={t('confirmRemove.cancel')}
        loading={remove.isPending}
        onConfirm={handleRemove}
        onCancel={removeDialog.closeDialog}
      />
    </div>
  );
}
