'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useExpenseComments, useCommentMutations } from '@/hooks/queries';
import { formatRelativeTime } from '@/lib/relativeTime';
import type { CommentDto } from '@/types';

export interface ExpenseCommentsProps {
  tripId: string;
  expenseId: string;
  currentUserId?: string;
  isAdmin: boolean;
}

/**
 * 支出留言串（roadmap #10）。視覺比照 ActivityFeed 的時間軸手感（圓形 icon + 內文 +
 * 相對時間），但留言需要輸入框與刪除操作——動態牆是唯讀的，直接複用元件反而要加不少
 * 條件分支，所以這裡是共用視覺語言，不是共用元件。
 */
export function ExpenseComments({
  tripId,
  expenseId,
  currentUserId,
  isAdmin,
}: ExpenseCommentsProps) {
  const locale = useLocale();
  const t = useTranslations('comments');
  const [draft, setDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: comments = [], isLoading } = useExpenseComments(tripId, expenseId, true);
  const { create, remove } = useCommentMutations(tripId);

  const handlePost = () => {
    const body = draft.trim();
    if (!body) return;
    create.mutate(
      { expenseId, input: { body } },
      {
        onSuccess: () => setDraft(''),
      }
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(
      { expenseId, commentId: deleteTarget },
      { onSuccess: () => setDeleteTarget(null) }
    );
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {isLoading ? (
        <p className="py-3 text-center text-sm text-muted-foreground">{t('loading')}</p>
      ) : comments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-1">
          {comments.map((c: CommentDto) => (
            <li key={c.id} className="flex items-start gap-2 rounded-lg px-1 py-2">
              <Avatar className="mt-0.5 h-7 w-7 shrink-0 text-[10px]">
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {(c.author_name || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">{c.author_name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(c.created_at, locale)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-snug">{c.body}</p>
              </div>
              {(c.author_id === currentUserId || isAdmin) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(c.id)}
                  aria-label={t('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('placeholder')}
          className="min-h-9 resize-none text-sm"
          rows={1}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!draft.trim() || create.isPending}
          onClick={handlePost}
          aria-label={t('post')}
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirmTitle')}
        message={t('deleteConfirmMessage')}
        severity="error"
        confirmText={t('delete')}
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** Toggle 按鈕：「留言 (N)」，展開才 render <ExpenseComments />（lazy-enable query）。 */
export function ExpenseCommentsToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('comments');
  return (
    <Button
      type="button"
      variant={open ? 'secondary' : 'ghost'}
      size="sm"
      className="gap-1.5 px-2 text-muted-foreground"
      onClick={onToggle}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {t('count', { count })}
    </Button>
  );
}
