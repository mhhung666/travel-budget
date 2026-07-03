'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TripNote } from '@/types';
import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface NoteEditDialogProps {
  note: TripNote | null;
  saving: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}

/** 編輯隨手記內容（桌機 Dialog／行動端全螢幕 Sheet）。 */
export function NoteEditDialog({ note, saving, onSave, onClose }: NoteEditDialogProps) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');
  const [draft, setDraft] = useState('');
  const [lastNoteId, setLastNoteId] = useState<string | null>(null);

  // 開啟／換一則筆記時於 render 期間重灌草稿（adjusting state when props change 模式，
  // 免 effect）；關閉時清掉紀錄，讓同一則重新開啟也回到原文。
  if (note && note.id !== lastNoteId) {
    setLastNoteId(note.id);
    setDraft(note.text);
  } else if (!note && lastNoteId !== null) {
    setLastNoteId(null);
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSave(text);
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
      <form id="note-edit-form" onSubmit={submit}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          maxLength={500}
          autoFocus
          className="resize-none"
        />
      </form>
    </ResponsiveFormSheet>
  );
}
