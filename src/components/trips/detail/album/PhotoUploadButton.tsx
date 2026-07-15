'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus, Loader2 } from 'lucide-react';
import { uploadPhotoFilesInBatches, type PhotoUploadFailure } from '@/lib/photoUpload';
import type { PhotoItemInput } from '@/lib/validation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// accept 刻意不列 HEIC：iOS 選圖器在 accept 不含 HEIC 時會自動把 HEIC 轉成 JPEG 才交給網頁
// （EXIF／GPS 保留）。加了 HEIC，iPhone 會直接送 HEIC 進來，瀏覽器解不開、相簿當場壞掉。
// 這行不是漏了優化，千萬別「順手」加回去。
const ACCEPT = 'image/jpeg,image/png,image/webp';

const FAILURE_MESSAGE_KEY: Record<PhotoUploadFailure, string> = {
  'too-large': 'uploadTooLarge',
  unsupported: 'uploadUnsupported',
  failed: 'uploadFailed',
};

/**
 * 相簿上傳按鈕：選檔 → 直傳 R2 → 每批交回呼叫端入庫（見 lib/photoUpload.ts）。
 * 傳檔與入庫刻意分開，成功的檔案不因入庫失敗陪葬；逐檔獨立失敗，不同 reason 分別
 * 跳 toast，不讓一張壞檔擋住整批訊息。
 *
 * 選超過 PHOTO_BATCH_MAX 張會**自動分批**（每批傳完就入庫再傳下一批），不是把多的丟掉——
 * 「一次把整趟旅程的照片丟進去」正是相簿的預設用法。
 */
export function PhotoUploadButton({
  tripId,
  onUploaded,
  pending,
}: {
  tripId: string;
  /** 入庫一批相片。回傳的 promise 決議後才會開始傳下一批。 */
  onUploaded: (items: PhotoItemInput[]) => Promise<void>;
  /** 入庫 mutation 進行中時一併鎖住按鈕，避免同時觸發第二批上傳。 */
  pending?: boolean;
}) {
  const t = useTranslations('album');
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { failures } = await uploadPhotoFilesInBatches(Array.from(files), {
        tripId,
        onBatch: onUploaded,
      });
      for (const failure of failures) {
        toast({
          title: failure.name,
          description: t(FAILURE_MESSAGE_KEY[failure.reason]),
          variant: 'destructive',
        });
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const busy = uploading || pending;

  return (
    <>
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {t('upload')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );
}
