'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PhotoLightbox } from '@/components/trips/detail/album/PhotoLightbox';
import { countryCodeToFlag } from './country';
import type { PhotoPin } from './photos';

/**
 * 相片釘點的相片 gallery。相片來自旅程相簿（Photo collection），`thumb_url`／`url` 已由
 * action 用 presignGetStable 批次簽好（不再逐張呼叫 getReceiptUrl）。點縮圖開啟相簿共用的
 * PhotoLightbox（唯讀：不給 onDelete／onUpdate，編輯留在相簿頁一處），可放大、換張、下載。
 */
export default function PhotoPinDialog({
  pin,
  onOpenChange,
}: {
  pin: PhotoPin | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('map');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <Dialog open={pin !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{countryCodeToFlag(pin?.countryCode)}</span>
              <span className="truncate">{pin?.name}</span>
            </DialogTitle>
            <DialogDescription>
              {t('photoCount', { count: pin?.photos.length ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          {pin && (
            <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto py-1 sm:grid-cols-4">
              {pin.photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted transition-opacity hover:opacity-80"
                  aria-label={photo.caption || t('photoCount', { count: 1 })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
                  <img
                    src={photo.thumb_url}
                    alt={photo.caption || ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* pin 為 null 時強制關閉，避免關掉釘點對話框後殘留一個空的 lightbox。 */}
      <PhotoLightbox
        photos={pin?.photos ?? []}
        index={pin ? lightboxIndex : null}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
