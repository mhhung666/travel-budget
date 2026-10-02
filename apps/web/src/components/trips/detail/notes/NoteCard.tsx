'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Images,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import type { TripNote } from '@/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relativeTime';
import { shouldCollapseNote, summarizeNote, toggleNoteTask } from '@/lib/noteMarkdown';
import MarkdownRenderer from '@/components/trips/detail/itinerary/MarkdownRenderer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NoteThumb } from '@/components/trips/detail/ReceiptAttachments';

export interface NoteCardProps {
  tripId: string;
  note: TripNote;
  canEdit: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onPlan: () => void;
  onDelete: () => void;
  /** 內文 task checkbox 被點擊後的新全文（原文 `[ ]`↔`[x]` 已改寫）。 */
  onToggleTask: (nextText: string) => void;
}

/**
 * 一則隨手記卡片：Markdown 內文 + 作者/相對時間列 + ⋯ 選單（編輯／釘選／加入行程／刪除）。
 * 長筆記（見 shouldCollapseNote）預設摺疊成「首行標題＋兩行純文字摘要」，點擊展開
 * 才渲染完整 Markdown；GFM task checkbox 以事件委派打勾（DOM 順序＝原文順序）。
 * 已規劃（planned_at 非 null）的卡片降透明度、掛「已規劃 · Day N」Badge，
 * 選單只剩刪除（內容已進行程，不再編輯/轉換），checkbox 也一併唯讀。
 */
export function NoteCard({
  tripId,
  note,
  canEdit,
  onEdit,
  onTogglePin,
  onPlan,
  onDelete,
  onToggleTask,
}: NoteCardProps) {
  const t = useTranslations('notes');
  const locale = useLocale();
  const planned = note.planned_at !== null;
  // 更新過才顯示「已編輯」時間戳：createNote 會同時寫入 created/updated，兩者僅差
  // 亞秒級，故以 1 秒為門檻濾掉建立當下的微差（含 pin/附件/task 打勾等任何寫入）。
  const edited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 1000;
  const single = note.attachments.length === 1;
  const tasksEnabled = canEdit && !planned;

  const collapsible = shouldCollapseNote(note.text);
  const [expanded, setExpanded] = useState(false);
  const showFull = !collapsible || expanded;
  const summary = useMemo(
    () => (collapsible ? summarizeNote(note.text) : null),
    [collapsible, note.text]
  );

  /** 委派內文裡的 checkbox 點擊：以 DOM 順序找到序號，改寫原文後交給呼叫端存回。 */
  const handleTaskClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    e.preventDefault();
    if (!tasksEnabled) return;
    const boxes = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
    const next = toggleNoteTask(note.text, boxes.indexOf(target));
    if (next !== null) onToggleTask(next);
  };

  return (
    <Card className={cn(planned && 'opacity-60')}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {showFull ? (
              <>
                <div className="break-words text-sm leading-relaxed" onClick={handleTaskClick}>
                  <MarkdownRenderer
                    content={note.text}
                    variant="compact"
                    interactiveTasks={tasksEnabled}
                  />
                </div>
                {collapsible && (
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    aria-expanded
                    className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronUp className="h-3 w-3" />
                    {t('collapse')}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-expanded={false}
                className="block w-full text-left"
              >
                <span className="line-clamp-1 break-all text-sm font-medium">{summary?.title}</span>
                {summary?.excerpt && (
                  <span className="mt-0.5 line-clamp-2 break-all text-sm text-muted-foreground">
                    {summary.excerpt}
                  </span>
                )}
                <span className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary">
                  <ChevronDown className="h-3 w-3" />
                  {t('showAll')}
                  {note.attachments.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                      <Images className="h-3 w-3" />
                      {note.attachments.length}
                    </span>
                  )}
                </span>
              </button>
            )}
            {showFull && note.attachments.length > 0 && (
              <div className={cn('mt-2 gap-2', single ? 'flex' : 'grid grid-cols-3')}>
                {note.attachments.map((a) => (
                  <NoteThumb
                    key={a.key}
                    tripId={tripId}
                    attachment={a}
                    thumbClassName={single ? 'h-44 w-full max-w-xs' : 'h-24 w-full'}
                  />
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5">
              {note.pinned && !planned && (
                <Pin className="h-3 w-3 shrink-0 fill-current text-primary" />
              )}
              {planned && note.planned_day_number !== null && (
                <Badge variant="secondary" className="shrink-0">
                  {t('plannedBadge', { day: note.planned_day_number })}
                </Badge>
              )}
              <Avatar className="h-5 w-5 text-[9px]">
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {(note.author_name || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {note.author_name} ·{' '}
                {edited
                  ? `${formatRelativeTime(note.updated_at, locale)} (${t('edited')})`
                  : formatRelativeTime(note.created_at, locale)}
              </span>
            </div>
          </div>

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={t('actions')}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!planned && (
                  <>
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onTogglePin}>
                      {note.pinned ? (
                        <PinOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Pin className="mr-2 h-4 w-4" />
                      )}
                      {note.pinned ? t('unpin') : t('pin')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onPlan}>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      {t('addToItinerary')}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
