'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Send } from 'lucide-react';
import type { ExpenseAttachment } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NoteImageUploader } from '@/components/trips/detail/ReceiptAttachments';

export interface NoteComposerProps {
  tripId: string;
  onSubmit: (text: string, attachments: ExpenseAttachment[]) => void;
  pending: boolean;
}

/**
 * 隨手記快速輸入框（頁面頂部常駐）。比照 ExpenseComments 的 composer 手感：
 * 單列起跳的 Textarea + 送出鍵；Enter 直接送出（`enterKeyHint="send"` 讓行動端
 * 鍵盤顯示「送出」）、Shift+Enter 換行。可選附上照片（上傳器在下方）。送出即清空，
 * 失敗由呼叫端 toast。
 */
export function NoteComposer({ tripId, onSubmit, pending }: NoteComposerProps) {
  const t = useTranslations('notes');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const imgs = attachments;
    setAttachments([]);
    onSubmit(text, imgs);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('placeholder')}
          className="min-h-10 resize-none"
          rows={1}
          maxLength={500}
          enterKeyHint="send"
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={!draft.trim() || pending}
          onClick={submit}
          aria-label={t('send')}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <NoteImageUploader tripId={tripId} value={attachments} onChange={setAttachments} />
    </div>
  );
}
