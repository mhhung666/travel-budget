'use client';

import { useTranslations } from 'next-intl';
import { Images } from 'lucide-react';
import type { TripPhoto } from '@/types';

/**
 * 行程日卡片上的「當天相片」橫向縮圖列（PLAN-PHOTOS Phase 2）。
 * 用 thumb_url（400px WebP）並橫向捲動：一天可能有幾十張，不能把行程頁撐爛。
 *
 * 相片是**成員限定**的：資料來自 usePhotos（直接呼叫 action、無公開 fallback），
 * 非成員拿到空陣列 → 呼叫端不會 render 這條列。這裡不自己抓資料，維持與相簿頁同一份
 * query 快取（一趟旅程的相片只查一次）。
 */
export function DayPhotoStrip({
  photos,
  onSelect,
}: {
  photos: TripPhoto[];
  onSelect: (index: number) => void;
}) {
  const t = useTranslations('album');

  if (photos.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Images className="h-3.5 w-3.5" />
        {t('dayPhotos', { count: photos.length })}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onSelect(index)}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
            <img
              src={photo.thumb_url}
              alt={photo.caption || t('photoAlt')}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
