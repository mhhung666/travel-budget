'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Loader2, Send } from 'lucide-react';
import type { ExpenseAttachment } from '@/types';
import { createNoteUploadUrl } from '@/actions';
import { uploadAttachmentFiles } from '@/lib/attachmentUpload';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NoteThumb } from '@/components/trips/detail/ReceiptAttachments';

const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp';
const MAX_LEN = 500;

export interface NoteComposerProps {
  tripId: string;
  onSubmit: (text: string, attachments: ExpenseAttachment[]) => void;
  pending: boolean;
}

/**
 * 隨手記快速輸入框（頁面頂部常駐），排成單一卡片：Textarea 在上、附件縮圖只在有圖時出現、
 * 底部工具列放「加照片」icon + 字數 + 送出。相片入口收成一顆 icon（不再常駐孤兒上傳方塊），
 * 選檔即走與收據相同的上傳流程（壓縮 → presigned PUT → headObject 驗證）。
 * Enter 送出、Shift+Enter 換行；也支援貼上圖片（截圖直接貼）。送出即清空，失敗由呼叫端 toast。
 */
export function NoteComposer({ tripId, onSubmit, pending }: NoteComposerProps) {
  const t = useTranslations('notes');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const { added } = await uploadAttachmentFiles(files, {
        tripId,
        createUploadUrl: createNoteUploadUrl,
      });
      if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || uploading) return;
    setDraft('');
    const imgs = attachments;
    setAttachments([]);
    onSubmit(text, imgs);
  };

  return (
    <div className="rounded-lg border bg-card focus-within:ring-1 focus-within:ring-ring">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
          if (imgs.length > 0) {
            e.preventDefault();
            void upload(imgs);
          }
        }}
        placeholder={t('placeholder')}
        className="min-h-10 resize-none border-none px-3 pt-3 shadow-none focus-visible:ring-0"
        rows={1}
        maxLength={MAX_LEN}
        enterKeyHint="send"
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-1">
          {attachments.map((a) => (
            <NoteThumb
              key={a.key}
              tripId={tripId}
              attachment={a}
              onRemove={() => setAttachments((prev) => prev.filter((x) => x.key !== a.key))}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={t('addImage')}
          title={t('addImage')}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_IMAGE}
          multiple
          className="hidden"
          onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        />
        <span
          className={cn(
            'ml-auto text-xs tabular-nums text-muted-foreground',
            draft.length >= MAX_LEN && 'text-destructive'
          )}
        >
          {draft.length}/{MAX_LEN}
        </span>
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!draft.trim() || pending || uploading}
          onClick={submit}
          aria-label={t('send')}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
