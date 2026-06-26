'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import type { Checklist, Member } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChecklistItemRow from './ChecklistItemRow';

interface ChecklistCardProps {
  checklist: Checklist;
  members: Member[];
  canEdit: boolean;
  onAddItem: (text: string) => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onAssignItem: (itemId: string, assigneeId: string | null) => void;
  onRemoveItem: (itemId: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}

/** One checklist: editable title, progress bar, item rows, and an add-item row. */
export default function ChecklistCard({
  checklist,
  members,
  canEdit,
  onAddItem,
  onToggleItem,
  onAssignItem,
  onRemoveItem,
  onRename,
  onDelete,
}: ChecklistCardProps) {
  const t = useTranslations('checklist');
  const [newItem, setNewItem] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);

  const total = checklist.items.length;
  const done = checklist.items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const submitItem = () => {
    const text = newItem.trim();
    if (!text) return;
    onAddItem(text);
    setNewItem('');
  };

  const saveTitle = () => {
    const title = titleDraft.trim();
    if (title && title !== checklist.title) onRename(title);
    setEditingTitle(false);
  };

  const cancelTitle = () => {
    setTitleDraft(checklist.title);
    setEditingTitle(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          {editingTitle ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelTitle();
                }}
                className="h-8"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveTitle}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={cancelTitle}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h3 className="flex-1 break-words text-lg font-semibold">{checklist.title}</h3>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-sm tabular-nums text-muted-foreground">
              {done}/{total}
            </span>
            {canEdit && !editingTitle && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => {
                    setTitleDraft(checklist.title);
                    setEditingTitle(true);
                  }}
                  aria-label={t('renameList')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                  aria-label={t('deleteList')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('emptyItems')}</p>
        ) : (
          <div className="divide-y divide-border/60">
            {checklist.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                members={members}
                canEdit={canEdit}
                onToggle={(d) => onToggleItem(item.id, d)}
                onAssign={(a) => onAssignItem(item.id, a)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
          </div>
        )}

        {canEdit && (
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitItem();
                }
              }}
              placeholder={t('itemPlaceholder')}
              className="h-9"
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={submitItem}
              disabled={!newItem.trim()}
              aria-label={t('addItem')}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
