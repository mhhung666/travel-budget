'use client';

import { useTranslations } from 'next-intl';
import { Check, MoreVertical, Trash2, UserPlus } from 'lucide-react';
import type { ChecklistItem, Member } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  members: Member[];
  canEdit: boolean;
  busy?: boolean;
  onToggle: (done: boolean) => void;
  onAssign: (assigneeId: string | null) => void;
  onRemove: () => void;
}

/**
 * 一列清單項目：checkbox + 文字 + 指派頭像 chip（僅已指派時顯示）+ ⋯ 選單（指派 / 刪除）。
 * 相較舊版每列常駐一個成員下拉（「指派意義不明」的噪音源），未指派時完全不顯示任何指派 UI；
 * 指派/清除/刪除都收進列尾的 ⋯ 選單，行動端也點得到（取代舊版 hover 才浮現的 X）。
 */
export default function ChecklistItemRow({
  item,
  members,
  canEdit,
  busy,
  onToggle,
  onAssign,
  onRemove,
}: ChecklistItemRowProps) {
  const t = useTranslations('checklist');

  const initial = (item.assignee_name || '?').charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 py-1.5">
      <Checkbox
        checked={item.done}
        disabled={!canEdit || busy}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={item.text}
      />
      <span
        className={cn(
          'flex-1 break-words text-sm',
          item.done && 'text-muted-foreground line-through'
        )}
      >
        {item.text}
      </span>

      {/* 已指派才顯示頭像 chip；未指派無雜訊 */}
      {item.assignee_id && (
        <span
          className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
          title={item.assignee_name ?? undefined}
        >
          <Avatar className="h-5 w-5 text-[9px]">
            <AvatarFallback className="bg-primary/10 text-primary">{initial}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate sm:inline">{item.assignee_name}</span>
        </span>
      )}

      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              disabled={busy}
              aria-label={t('itemActions')}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              {t('assignTo')}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onAssign(null)}>
              <Check
                className={cn('mr-2 h-4 w-4', item.assignee_id ? 'opacity-0' : 'opacity-100')}
              />
              {t('unassigned')}
            </DropdownMenuItem>
            {members.map((mem) => (
              <DropdownMenuItem key={mem.id} onClick={() => onAssign(mem.id)}>
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    item.assignee_id === mem.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {mem.display_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onRemove}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('removeItem')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
