'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Copy, FilePlus2, Loader2, Luggage } from 'lucide-react';
import { CHECKLIST_TEMPLATES } from '@/constants/checklistTemplates';
import { useCopyableChecklists } from '@/hooks/queries';
import { ResponsiveFormSheet, EmptyState } from '@/components/common';

export interface NewChecklistSheetProps {
  tripId: string;
  open: boolean;
  pending: boolean;
  /** 建立一份清單（title + 項目文字，空陣列＝空白清單）。呼叫端負責 mutation + 關閉。 */
  onCreate: (title: string, items: string[]) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * 新增清單面板：解「冷啟動空白」。第一層是範本選擇（行前待辦 / 行李打包 / 購物 / 藥品證件）
 * 加空白清單與「從其他旅程複製」；第二層列出使用者其他旅程的既有清單，一鍵把項目搬過來。
 * 範本文字全走 i18n（`checklist.templates.*`），複製只搬項目文字（不搬指派 / 勾選狀態）。
 */
export function NewChecklistSheet({
  tripId,
  open,
  pending,
  onCreate,
  onOpenChange,
}: NewChecklistSheetProps) {
  const t = useTranslations('checklist');
  const [mode, setMode] = useState<'menu' | 'copy'>('menu');
  const { data: sources = [], isLoading } = useCopyableChecklists(tripId, open && mode === 'copy');

  // 關閉時重置回第一層，下次開啟從範本選單開始。
  const handleOpenChange = (o: boolean) => {
    if (!o) setMode('menu');
    onOpenChange(o);
  };

  const rowClass =
    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50';

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={mode === 'menu' ? t('newListTitle') : t('copyFromTripTitle')}
      description={mode === 'menu' ? t('newListTitle') : t('copyFromTripTitle')}
    >
      {mode === 'menu' ? (
        <div className="flex flex-col gap-2">
          {CHECKLIST_TEMPLATES.map((tpl) => {
            const items = t.raw(`templates.${tpl.id}.items`) as string[];
            return (
              <button
                key={tpl.id}
                type="button"
                disabled={pending}
                onClick={() => onCreate(t(`templates.${tpl.id}.title`), items)}
                className={rowClass}
              >
                <span className="shrink-0 text-2xl leading-none">{tpl.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(`templates.${tpl.id}.title`)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {items.slice(0, 4).join('、')}
                    {items.length > 4 ? '…' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t('itemCount', { count: items.length })}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            disabled={pending}
            onClick={() => onCreate(t('blankListTitle'), [])}
            className={rowClass}
          >
            <FilePlus2 className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium">{t('blankList')}</span>
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => setMode('copy')}
            className={rowClass}
          >
            <Copy className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-medium">{t('copyFromTrip')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode('menu')}
            className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('back')}
          </button>

          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loadingCopySources')}
            </p>
          ) : sources.length === 0 ? (
            <EmptyState
              icon={Luggage}
              title={t('noCopySources')}
              description={t('noCopySourcesHint')}
            />
          ) : (
            sources.map((src) => (
              <div key={src.trip_id} className="flex flex-col gap-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">{src.trip_name}</p>
                {src.lists.map((list, i) => (
                  <button
                    key={`${src.trip_id}-${i}`}
                    type="button"
                    disabled={pending}
                    onClick={() => onCreate(list.title, list.items)}
                    className={rowClass}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{list.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {list.items.slice(0, 4).join('、')}
                        {list.items.length > 4 ? '…' : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t('itemCount', { count: list.items.length })}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </ResponsiveFormSheet>
  );
}
