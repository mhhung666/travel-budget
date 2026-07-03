'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import {
  createReceiptUploadUrl,
  getReceiptUrl,
  createItineraryUploadUrl,
  getItineraryAttachmentUrl,
  createNoteUploadUrl,
  getNoteAttachmentUrl,
} from '@/actions';
import type { ActionResult } from '@/actions';
import { uploadAttachmentFiles } from '@/lib/attachmentUpload';
import type { ExpenseAttachment } from '@/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp';

/** 取短效檢視 URL 的 server fn 形狀（getReceiptUrl / getItineraryAttachmentUrl）。 */
type GetUrlFn = (tripId: string, key: string) => Promise<ActionResult<{ url: string }>>;
/** 取上傳簽名的 server fn 形狀（createReceiptUploadUrl / createItineraryUploadUrl）。 */
type CreateUploadUrlFn = (
  tripId: string,
  contentType: string,
  size: number
) => Promise<ActionResult<{ uploadUrl: string; key: string }>>;

/**
 * 附件縮圖（收據 / 票券通用）。檔案存於 R2 私有 bucket，故顯示時向 getUrl 取短效簽名 URL：
 * 圖片直接 <img>，PDF 顯示檔案圖示。點擊在 app 內嵌 lightbox 對話框檢視（圖片放大、PDF 用
 * iframe 內嵌），開啟時重新簽一張新 URL 避免縮圖載入後過期。給 onRemove 時右上角顯示移除鈕。
 */
export function AttachmentThumb({
  tripId,
  attachment,
  getUrl,
  onRemove,
  itemLabel,
  thumbClassName,
}: {
  tripId: string;
  attachment: ExpenseAttachment;
  getUrl: GetUrlFn;
  onRemove?: () => void;
  /** 覆寫縮圖 alt / 檢視對話框標題（預設「收據」；筆記照片傳自己的標籤）。 */
  itemLabel?: string;
  /** 覆寫縮圖外框尺寸（預設 h-16 w-16；隨手記傳大尺寸讓照片變成內容）。 */
  thumbClassName?: string;
}) {
  const t = useTranslations('expense.receipts');
  const label = itemLabel ?? t('label');
  const isPdf = attachment.content_type === 'application/pdf';
  const [url, setUrl] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!isPdf) {
      getUrl(tripId, attachment.key).then((r) => {
        if (alive && r.success) setUrl(r.data.url);
      });
    }
    return () => {
      alive = false;
    };
  }, [tripId, attachment.key, isPdf, getUrl]);

  const openViewer = async () => {
    const r = await getUrl(tripId, attachment.key);
    if (r.success) {
      setViewerUrl(r.data.url);
      setOpen(true);
    }
  };

  return (
    <>
      <div className={cn('relative h-16 w-16 shrink-0', thumbClassName)}>
        <button
          type="button"
          onClick={openViewer}
          title={t('view')}
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border bg-muted"
        >
          {isPdf ? (
            <FileText className="h-6 w-6 text-muted-foreground" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定
            <img src={url} alt={label} className="h-full w-full object-cover" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {viewerUrl &&
            (isPdf ? (
              <iframe src={viewerUrl} title={label} className="h-[80vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定
              <img
                src={viewerUrl}
                alt={label}
                className="max-h-[85vh] w-full bg-black object-contain"
              />
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 附件上傳器（收據 / 票券通用）。選檔 → client 壓縮（imageCompress）→ 向 server 取
 * presigned PUT（createUploadUrl）→ 瀏覽器直傳 R2 → 把 { key, content_type, size } 加進 value。
 * 表單送出時這些 attachments 會併入對應的 create/update，server 端再以 headObject 驗證。
 */
export function AttachmentUploader({
  tripId,
  value,
  onChange,
  getUrl,
  createUploadUrl,
  compressKind = 'receipt',
  accept = ACCEPT,
  addLabel,
  itemLabel,
}: {
  tripId: string;
  value: ExpenseAttachment[];
  onChange: (next: ExpenseAttachment[]) => void;
  getUrl: GetUrlFn;
  createUploadUrl: CreateUploadUrlFn;
  compressKind?: 'receipt';
  accept?: string;
  /** 覆寫「新增」按鈕 title（預設「新增收據」）。 */
  addLabel?: string;
  /** 覆寫縮圖 alt / 檢視標題（預設「收據」）。 */
  itemLabel?: string;
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
      const { added, failed } = await uploadAttachmentFiles(Array.from(files), {
        tripId,
        createUploadUrl,
        compressKind,
      });
      if (failed) setError(t('uploadFailed'));
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
          <AttachmentThumb
            key={a.key}
            tripId={tripId}
            attachment={a}
            getUrl={getUrl}
            onRemove={() => remove(a.key)}
            itemLabel={itemLabel}
          />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title={addLabel ?? t('add')}
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
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** 收據縮圖（支出用）：AttachmentThumb 綁定 getReceiptUrl。 */
export function ReceiptThumb({
  tripId,
  attachment,
  onRemove,
}: {
  tripId: string;
  attachment: ExpenseAttachment;
  onRemove?: () => void;
}) {
  return (
    <AttachmentThumb
      tripId={tripId}
      attachment={attachment}
      getUrl={getReceiptUrl}
      onRemove={onRemove}
    />
  );
}

/** 收據上傳器（支出表單用）：AttachmentUploader 綁定收據的 server fns。 */
export function ReceiptUploader({
  tripId,
  value,
  onChange,
}: {
  tripId: string;
  value: ExpenseAttachment[];
  onChange: (next: ExpenseAttachment[]) => void;
}) {
  return (
    <AttachmentUploader
      tripId={tripId}
      value={value}
      onChange={onChange}
      getUrl={getReceiptUrl}
      createUploadUrl={createReceiptUploadUrl}
    />
  );
}

/** 票券縮圖（行程活動用）：AttachmentThumb 綁定 getItineraryAttachmentUrl。 */
export function TicketThumb({
  tripId,
  attachment,
  onRemove,
}: {
  tripId: string;
  attachment: ExpenseAttachment;
  onRemove?: () => void;
}) {
  return (
    <AttachmentThumb
      tripId={tripId}
      attachment={attachment}
      getUrl={getItineraryAttachmentUrl}
      onRemove={onRemove}
    />
  );
}

/** 票券上傳器（行程活動編輯器用）：AttachmentUploader 綁定票券的 server fns。 */
export function TicketUploader({
  tripId,
  value,
  onChange,
}: {
  tripId: string;
  value: ExpenseAttachment[];
  onChange: (next: ExpenseAttachment[]) => void;
}) {
  return (
    <AttachmentUploader
      tripId={tripId}
      value={value}
      onChange={onChange}
      getUrl={getItineraryAttachmentUrl}
      createUploadUrl={createItineraryUploadUrl}
    />
  );
}

/** 隨手記照片縮圖：AttachmentThumb 綁定 getNoteAttachmentUrl。 */
export function NoteThumb({
  tripId,
  attachment,
  onRemove,
  thumbClassName,
}: {
  tripId: string;
  attachment: ExpenseAttachment;
  onRemove?: () => void;
  thumbClassName?: string;
}) {
  const t = useTranslations('notes');
  return (
    <AttachmentThumb
      tripId={tripId}
      attachment={attachment}
      getUrl={getNoteAttachmentUrl}
      onRemove={onRemove}
      itemLabel={t('imageLabel')}
      thumbClassName={thumbClassName}
    />
  );
}

/** 隨手記照片上傳器：AttachmentUploader 綁定筆記的 server fns（僅收圖片）。 */
export function NoteImageUploader({
  tripId,
  value,
  onChange,
}: {
  tripId: string;
  value: ExpenseAttachment[];
  onChange: (next: ExpenseAttachment[]) => void;
}) {
  const t = useTranslations('notes');
  return (
    <AttachmentUploader
      tripId={tripId}
      value={value}
      onChange={onChange}
      getUrl={getNoteAttachmentUrl}
      createUploadUrl={createNoteUploadUrl}
      accept={ACCEPT_IMAGE}
      addLabel={t('addImage')}
      itemLabel={t('imageLabel')}
    />
  );
}
