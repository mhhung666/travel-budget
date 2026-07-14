'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TripNote, ExpenseAttachment } from '@/types';
import { NOTE_TEXT_MAX } from '@/lib/validation';
import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MarkdownRenderer from '@/components/trips/detail/itinerary/MarkdownRenderer';
import { NoteImageUploader } from '@/components/trips/detail/ReceiptAttachments';

export interface NoteEditDialogProps {
  tripId: string;
  note: TripNote | null;
  saving: boolean;
  onSave: (text: string, attachments: ExpenseAttachment[]) => void;
  onClose: () => void;
}

/**
 * 編輯隨手記內容與照片（桌機 Dialog／行動端全螢幕 Sheet）。
 * 內容支援 Markdown：編輯／預覽兩個 tab，預覽用與卡片相同的 compact 渲染。
 */
export function NoteEditDialog({ tripId, note, saving, onSave, onClose }: NoteEditDialogProps) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [tab, setTab] = useState('write');
  const [lastNoteId, setLastNoteId] = useState<string | null>(null);

  // 開啟／換一則筆記時於 render 期間重灌草稿（adjusting state when props change 模式，
  // 免 effect）；關閉時清掉紀錄，讓同一則重新開啟也回到原文。tab 一併重設回編輯。
  if (note && note.id !== lastNoteId) {
    setLastNoteId(note.id);
    setDraft(note.text);
    setAttachments(note.attachments);
    setTab('write');
  } else if (!note && lastNoteId !== null) {
    setLastNoteId(null);
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSave(text, attachments);
  };

  return (
    <ResponsiveFormSheet
      open={note !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('editTitle')}
      description={t('editTitle')}
      footer={
        <Button form="note-edit-form" type="submit" disabled={!draft.trim() || saving}>
          {tCommon('save')}
        </Button>
      }
    >
      <form id="note-edit-form" onSubmit={submit} className="space-y-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="write">{t('editorTab')}</TabsTrigger>
            <TabsTrigger value="preview">{t('previewTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="space-y-1.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              maxLength={NOTE_TEXT_MAX}
              autoFocus
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{t('markdownHint')}</p>
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-[13rem] rounded-md border p-3 text-sm leading-relaxed">
              {draft.trim() ? (
                <MarkdownRenderer content={draft} variant="compact" />
              ) : (
                <p className="text-muted-foreground">{t('previewEmpty')}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <NoteImageUploader tripId={tripId} value={attachments} onChange={setAttachments} />
      </form>
    </ResponsiveFormSheet>
  );
}
