'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import type { TripPhoto } from '@/types';
import { intlLocale } from '@/lib/relativeTime';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common';

/**
 * 相簿 lightbox：Dialog 放大檢視 + 上一張/下一張（含鍵盤 ←/→）+ 下載 + 刪除。
 * 放大圖用 photo.url（顯示檔，自帶完整 EXIF）而非 thumb_url——下載按鈕直接連到它，
 * 存回手機後 Apple 照片／Google 相簿才讀得到地點，不必另打 action 拿 URL。
 *
 * index 由呼叫端（頁面）持有，這裡只負責上一張/下一張的換算與鍵盤事件；
 * 刪除採兩段式：先跳 ConfirmDialog（同 repo 既有刪除慣例），確認後才呼叫 onDelete。
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onDelete,
  deleting,
  canDelete,
}: {
  photos: TripPhoto[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  onDelete: (photo: TripPhoto) => void;
  deleting: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('album');
  const locale = useLocale();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const open = index !== null;
  const photo = index !== null ? (photos[index] ?? null) : null;

  const goPrev = () => {
    if (index === null) return;
    onIndexChange(index > 0 ? index - 1 : photos.length - 1);
  };
  const goNext = () => {
    if (index === null) return;
    onIndexChange(index < photos.length - 1 ? index + 1 : 0);
  };

  // 鍵盤左右鍵切換上一張/下一張，只在 lightbox 開啟時綁定，關閉自動解除。
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goPrev/goNext 依 index 重建，僅需隨 open/index 重綁
  }, [open, index, photos.length]);

  const handleOpenChange = (next: boolean) => {
    if (!next) onIndexChange(null);
  };

  const confirmDelete = () => {
    if (!photo) return;
    setConfirmingDelete(false);
    onDelete(photo);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">{t('lightboxTitle')}</DialogTitle>
          {photo && (
            <div className="flex flex-col">
              <div className="relative flex items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
                <img
                  src={photo.url}
                  alt={photo.caption || t('photoAlt')}
                  className="max-h-[70vh] w-full object-contain"
                />
                {photos.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={goPrev}
                      aria-label={t('previous')}
                      className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={goNext}
                      aria-label={t('next')}
                      className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-xs text-muted-foreground">
                  <p className="truncate">{photo.uploaded_by_name}</p>
                  {photo.taken_at && (
                    <p>{new Date(photo.taken_at).toLocaleString(intlLocale(locale))}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" asChild title={t('download')}>
                    {/*
                      `download` 屬性**跨來源會被忽略**，而簽名 URL 位於 R2 的網域——所以這顆
                      在桌機是「開啟原圖」而非直接下載，故加 target=_blank 免得整個相簿被導航掉。
                      行動裝置上就是計畫要的路徑：開圖 → 長按存到「照片」，GPS 跟著進相簿。
                      要真正強制下載得簽一張帶 ResponseContentDisposition 的 URL（另一組簽名、
                      另一筆 SW 快取），Phase 1 不值得這個代價。
                    */}
                    <a href={photo.url} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title={t('delete')}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDelete}
        title={t('deleteConfirmTitle')}
        message={t('deleteConfirmMessage')}
        severity="error"
        confirmText={t('delete')}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
