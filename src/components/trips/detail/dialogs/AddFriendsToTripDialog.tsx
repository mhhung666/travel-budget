'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Users } from 'lucide-react';

import { useFriends } from '@/hooks/queries';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

interface AddFriendsToTripDialogProps {
  open: boolean;
  onClose: () => void;
  /** 已在旅程中的成員 id，用來過濾掉已是成員的好友 */
  existingMemberIds: string[];
  onSubmit: (friendIds: string[]) => Promise<void>;
}

/**
 * 「從好友挑選」多選對話框（ROADMAP #12 Phase 3）。列出尚未在旅程中的已成立好友，
 * 勾選後一次直接加入。好友資料共用 useFriends 快取（與設定頁好友卡片同一份）。
 */
export default function AddFriendsToTripDialog({
  open,
  onClose,
  existingMemberIds,
  onSubmit,
}: AddFriendsToTripDialogProps) {
  const t = useTranslations('member');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useFriends(open);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 尚未在旅程中的好友（可挑選對象）
  const candidates = useMemo(() => {
    const memberSet = new Set(existingMemberIds);
    return (data?.friends ?? []).filter((f) => !memberSet.has(f.user.id));
  }, [data, existingMemberIds]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟時重設勾選，刻意同步
      setSelected(new Set());
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    try {
      await onSubmit([...selected]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('addFriends')}</DialogTitle>
          <DialogDescription>{t('addFriendsHint')}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Users className="h-8 w-8" />
              <p className="text-sm">{t('noFriendsToAdd')}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-72">
              <div className="space-y-2 pr-3">
                {candidates.map((f) => (
                  <label
                    key={f.user.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={selected.has(f.user.id)}
                      onCheckedChange={() => toggle(f.user.id)}
                    />
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={f.user.avatar_url ?? ''} alt={f.user.display_name} />
                      <AvatarFallback className="bg-primary font-medium text-primary-foreground">
                        {f.user.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.user.display_name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{f.user.username}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selected.size === 0}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selected.size > 0 ? t('addSelectedCount', { count: selected.size }) : tCommon('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
