'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CalendarPlus, MoreVertical, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import type { TripNote } from '@/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/relativeTime';
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

export interface NoteCardProps {
  note: TripNote;
  canEdit: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onPlan: () => void;
  onDelete: () => void;
}

/**
 * 一則隨手記卡片：內文 + 作者/相對時間列 + ⋯ 選單（編輯／釘選／加入行程／刪除）。
 * 已規劃（planned_at 非 null）的卡片降透明度、掛「已規劃 · Day N」Badge，
 * 選單只剩刪除（內容已進行程，不再編輯/轉換）。
 */
export function NoteCard({ note, canEdit, onEdit, onTogglePin, onPlan, onDelete }: NoteCardProps) {
  const t = useTranslations('notes');
  const locale = useLocale();
  const planned = note.planned_at !== null;

  return (
    <Card className={cn(planned && 'opacity-60')}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {note.pinned && !planned && (
                <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-primary" />
              )}
              {planned && note.planned_day_number !== null && (
                <Badge variant="secondary" className="shrink-0">
                  {t('plannedBadge', { day: note.planned_day_number })}
                </Badge>
              )}
            </div>
            <p
              className={cn(
                'whitespace-pre-wrap break-words text-sm leading-relaxed',
                (note.pinned && !planned) || planned ? 'mt-1' : ''
              )}
            >
              {note.text}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <Avatar className="h-5 w-5 text-[9px]">
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {(note.author_name || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {note.author_name} · {formatRelativeTime(note.created_at, locale)}
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
