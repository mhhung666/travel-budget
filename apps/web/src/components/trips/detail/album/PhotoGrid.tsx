'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { TripPhoto } from '@/types';
import { cn } from '@/lib/utils';

/**
 * 相簿縮圖 grid：一律用 thumb_url（400px WebP，不需 EXIF），避免一次載入數十張全尺寸圖。
 * 點擊只回報 index，開哪個 lightbox 由呼叫端（頁面）決定，這裡不持有檢視狀態。
 *
 * 選取模式（Phase 2）下點擊改為勾選／取消，同樣不持有狀態——選取集合由頁面持有，
 * 因為批次刪除、全選、離開選取模式都是頁面層的事。
 */
export function PhotoGrid({
  photos,
  onSelect,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
}: {
  photos: TripPhoto[];
  onSelect: (index: number) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (photoId: string) => void;
}) {
  const t = useTranslations('album');

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
      {photos.map((photo, index) => {
        const selected = !!selectedIds?.has(photo.id);
        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => (selectionMode ? onToggleSelect?.(photo.id) : onSelect(index))}
            aria-pressed={selectionMode ? selected : undefined}
            aria-label={selectionMode ? t('selectPhoto') : undefined}
            className={cn(
              'relative aspect-square overflow-hidden rounded-md bg-muted',
              selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
            <img
              src={photo.thumb_url}
              alt={photo.caption || t('photoAlt')}
              className={cn(
                'h-full w-full object-cover transition-transform',
                !selectionMode && 'hover:scale-105',
                selected && 'scale-95'
              )}
              loading="lazy"
            />
            {selectionMode && (
              <span
                className={cn(
                  'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/80 shadow',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-black/30'
                )}
              >
                {selected && <Check className="h-3 w-3" />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
