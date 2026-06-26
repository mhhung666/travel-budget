'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { createReceiptUploadUrl, getReceiptUrl } from '@/actions';
import { compressImage } from '@/lib/imageCompress';
import type { ExpenseAttachment } from '@/types';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * 收據縮圖。收據存於 R2 私有 bucket，故顯示時向 getReceiptUrl 取短效簽名 URL：
 * 圖片直接 <img>，PDF 顯示檔案圖示。點擊一律重新簽一張新 URL 再開新分頁（避免縮圖
 * 載入後 URL 過期）。給 onRemove 時右上角顯示移除鈕（編輯表單用）。
 */
export function ReceiptThumb({
  tripId,
  attachment,
  onRemove,
}: {
  tripId: string;
  attachment: ExpenseAttachment;
  onRemove?: () => void;
}) {
  const t = useTranslations('expense.receipts');
  const isPdf = attachment.content_type === 'application/pdf';
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!isPdf) {
      getReceiptUrl(tripId, attachment.key).then((r) => {
        if (alive && r.success) setUrl(r.data.url);
      });
    }
    return () => {
      alive = false;
    };
  }, [tripId, attachment.key, isPdf]);

  const open = async () => {
    const r = await getReceiptUrl(tripId, attachment.key);
    if (r.success) window.open(r.data.url, '_blank', 'noopener');
  };

  return (
    <div className="relative h-16 w-16 shrink-0">
      <button
        type="button"
        onClick={open}
        title={t('view')}
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border bg-muted"
      >
        {isPdf ? (
          <FileText className="h-6 w-6 text-muted-foreground" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定
          <img src={url} alt={t('label')} className="h-full w-full object-cover" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('remove')}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-90 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * 收據上傳器（支出表單用）。選檔 → client 壓縮（imageCompress）→ 向 server 取
 * presigned PUT → 瀏覽器直傳 R2 → 把 { key, content_type, size } 加進 value。
 * 表單送出時這些 attachments 會併入 create/update，server 端再以 headObject 驗證。
 */
export function ReceiptUploader({
  tripId,
  value,
  onChange,
}: {
  tripId: string;
  value: ExpenseAttachment[];
  onChange: (next: ExpenseAttachment[]) => void;
}) {
  const t = useTranslations('expense.receipts');
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const picked = Array.from(files);
      const results = await Promise.all(
        picked.map(async (original): Promise<ExpenseAttachment | null> => {
          const file = await compressImage(original, 'receipt');
          const ticket = await createReceiptUploadUrl(tripId, file.type, file.size);
          if (!ticket.success) return null;
          const put = await fetch(ticket.data.uploadUrl, {
            method: 'PUT',
            headers: { 'content-type': file.type },
            body: file,
          });
          if (!put.ok) return null;
          return { key: ticket.data.key, content_type: file.type, size: file.size };
        })
      );
      const added = results.filter((a): a is ExpenseAttachment => a !== null);
      if (added.length < picked.length) setError(t('uploadFailed'));
      if (added.length > 0) onChange([...value, ...added]);
    } catch {
      setError(t('uploadFailed'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (key: string) => onChange(value.filter((a) => a.key !== key));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((a) => (
          <ReceiptThumb key={a.key} tripId={tripId} attachment={a} onRemove={() => remove(a.key)} />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title={t('add')}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
