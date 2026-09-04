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
  /** 目前使用者 id，用來算 packing 清單的「我的進度」與勾選狀態；未登入為 null。 */
  currentUserId: string | null;
  canEdit: boolean;
  pendingItemIds?: ReadonlySet<string>;
  onAddItem: (text: string) => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onAssignItem: (itemId: string, assigneeId: string | null) => void;
  onRemoveItem: (itemId: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** shopping 清單：勾選後「記一筆」帶品名開支出表單（帶品名字串）。 */
  onLogExpense?: (text: string) => void;
}

/** 各清單類型的前綴 emoji（與範本選單一致）。 */
const KIND_EMOJI: Record<Checklist['kind'], string> = {
  todo: '📋',
  packing: '🎒',
  shopping: '🛍️',
};

/** One checklist: editable title, progress bar, item rows, and an add-item row. */
export default function ChecklistCard({
  checklist,
  members,
  currentUserId,
  canEdit,
  pendingItemIds,
  onAddItem,
  onToggleItem,
  onAssignItem,
  onRemoveItem,
  onRename,
  onDelete,
  onLogExpense,
}: ChecklistCardProps) {
  const t = useTranslations('checklist');
  const tCommon = useTranslations('common');
  const [newItem, setNewItem] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);

  const isPacking = checklist.kind === 'packing';
  // packing＝每人各自勾，進度看「我」勾了幾項；其他類型＝共享的 done。
  const isItemDone = (i: Checklist['items'][number]) =>
    isPacking ? currentUserId != null && i.done_by.includes(currentUserId) : i.done;

  const total = checklist.items.length;
  const done = checklist.items.filter(isItemDone).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // 已完成項目沉底（純前端、穩定排序）：未完成在上、完成在下，進度一目了然。
  // packing 依「我」的完成狀態排，其他依共享 done。
  const sortedItems = [...checklist.items].sort(
    (a, b) => Number(isItemDone(a)) - Number(isItemDone(b))
  );

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
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={saveTitle}
                aria-label={tCommon('save')}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={cancelTitle}
                aria-label={tCommon('cancel')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-0.5">
              <h3 className="break-words text-lg font-semibold">{checklist.title}</h3>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{KIND_EMOJI[checklist.kind]}</span>
                {t(`kinds.${checklist.kind}`)}
                {isPacking && <span>· {t('myProgress')}</span>}
              </span>
            </div>
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
            {sortedItems.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                kind={checklist.kind}
                members={members}
                checked={isItemDone(item)}
                canEdit={canEdit}
                busy={pendingItemIds?.has(item.id)}
                onToggle={(d) => onToggleItem(item.id, d)}
                onAssign={(a) => onAssignItem(item.id, a)}
                onRemove={() => onRemoveItem(item.id)}
                onLogExpense={onLogExpense ? () => onLogExpense(item.text) : undefined}
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
