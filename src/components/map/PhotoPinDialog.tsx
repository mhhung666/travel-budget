'use client';

import { useTranslations } from 'next-intl';
import { getReceiptUrl } from '@/actions';
import { AttachmentThumb } from '@/components/trips/detail/ReceiptAttachments';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { countryCodeToFlag } from './country';
import type { PhotoPin } from './photos';

/**
 * 相片釘點的相片 gallery。每張相片存於 R2 私有 receipts bucket，故縮圖與 lightbox 都經
 * AttachmentThumb 逐張呼叫 getReceiptUrl（驗成員後取短效簽名 URL）——不預先全簽發，維持
 * 收據私有契約。size 對檢視無用，帶 0 即可。
 */
export default function PhotoPinDialog({
  pin,
  onOpenChange,
}: {
  pin: PhotoPin | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('map');

  return (
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
          <div className="flex max-h-[60vh] flex-wrap gap-3 overflow-y-auto py-1">
            {pin.photos.map((photo) => (
              <div key={photo.key} className="flex flex-col items-center gap-1">
                <AttachmentThumb
                  tripId={photo.tripId}
                  attachment={{ key: photo.key, content_type: photo.contentType, size: 0 }}
                  getUrl={getReceiptUrl}
                />
                {photo.description && (
                  <span className="max-w-16 truncate text-[10px] text-muted-foreground">
                    {photo.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
