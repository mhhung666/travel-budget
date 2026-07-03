'use client';

import { compressImage, type CompressPreset } from '@/lib/imageCompress';
import type { ActionResult } from '@/actions';
import type { ExpenseAttachment } from '@/types';

/** 取上傳簽名的 server fn 形狀（createReceiptUploadUrl / createNoteUploadUrl…）。 */
export type CreateUploadUrlFn = (
  tripId: string,
  contentType: string,
  size: number
) => Promise<ActionResult<{ uploadUrl: string; key: string }>>;

export interface UploadResult {
  /** 成功入庫的附件（可直接併入 create/update value）。 */
  added: ExpenseAttachment[];
  /** 是否有任何檔案上傳失敗（呼叫端據此顯示錯誤）。 */
  failed: boolean;
}

/**
 * 選檔後的共用上傳流程：client 壓縮（imageCompress）→ 向 server 取 presigned PUT →
 * 瀏覽器直傳 R2 → 回傳 { key, content_type, size }。收據上傳器（AttachmentUploader）與
 * 隨手記 composer 共用同一套流程，server 端最終仍以 headObject 驗證大小/型別。
 */
export async function uploadAttachmentFiles(
  files: File[],
  opts: {
    tripId: string;
    createUploadUrl: CreateUploadUrlFn;
    compressKind?: CompressPreset;
  }
): Promise<UploadResult> {
  const { tripId, createUploadUrl, compressKind = 'receipt' } = opts;
  const results = await Promise.all(
    files.map(async (original): Promise<ExpenseAttachment | null> => {
      const file = await compressImage(original, compressKind);
      const ticket = await createUploadUrl(tripId, file.type, file.size);
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
  return { added, failed: added.length < files.length };
}
