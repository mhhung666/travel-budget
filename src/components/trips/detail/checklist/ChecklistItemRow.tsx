'use client';

import { useTranslations } from 'next-intl';
import { X, User as UserIcon } from 'lucide-react';
import type { ChecklistItem, Member } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Radix Select reserves '' for clear/placeholder, so use a sentinel for "unassigned". */
const UNASSIGNED = '__none__';

interface ChecklistItemRowProps {
  item: ChecklistItem;
  members: Member[];
  canEdit: boolean;
  busy?: boolean;
  onToggle: (done: boolean) => void;
  onAssign: (assigneeId: string | null) => void;
  onRemove: () => void;
}

/** A single checklist item: checkbox + text + assignee (editable) + remove. */
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

  return (
    <div className="group flex items-center gap-2 py-1.5">
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

      {canEdit ? (
        <Select
          value={item.assignee_id ?? UNASSIGNED}
          onValueChange={(v) => onAssign(v === UNASSIGNED ? null : v)}
          disabled={busy}
        >
          <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>{t('unassigned')}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        item.assignee_name && (
          <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <UserIcon className="h-3 w-3" />
            {item.assignee_name}
          </span>
        )
      )}

      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={onRemove}
          disabled={busy}
          aria-label={t('removeItem')}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
