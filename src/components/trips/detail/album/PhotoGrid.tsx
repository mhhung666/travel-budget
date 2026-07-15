'use client';

import { useTranslations } from 'next-intl';
import type { TripPhoto } from '@/types';

/**
 * 相簿縮圖 grid：一律用 thumb_url（400px WebP，不需 EXIF），避免一次載入數十張全尺寸圖。
 * 點擊只回報 index，開哪個 lightbox 由呼叫端（頁面）決定，這裡不持有檢視狀態。
 */
export function PhotoGrid({
  photos,
  onSelect,
}: {
  photos: TripPhoto[];
  onSelect: (index: number) => void;
}) {
  const t = useTranslations('album');

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onSelect(index)}
          className="aspect-square overflow-hidden rounded-md bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
          <img
            src={photo.thumb_url}
            alt={photo.caption || t('photoAlt')}
            className="h-full w-full object-cover transition-transform hover:scale-105"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}
