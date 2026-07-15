'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Images, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import type { PublicAlbumPhoto } from '@/types';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';

/**
 * 公開相簿分享頁（PLAN-PHOTOS Phase 4 §8）：純相片牌，唯讀、不需登入。
 *
 * 只顯示相片＋說明＋日期＋旅程名——**沒有地圖、地名、座標、EXIF、上傳者**。
 * 公開 API（PUBLIC_ALBUM）回的 `url` 已是剝除 APP1 的消毒副本，縮圖本就無 EXIF，
 * 頁面上也沒有任何位置欄位可顯示。刻意不重用成員版 lightbox（帶編輯／刪除／關聯行程日）。
 */
export function PublicAlbumView({ code }: { code: string }) {
  const t = useTranslations('publicAlbum');
  const locale = useLocale();
  const [tripName, setTripName] = useState('');
  const [photos, setPhotos] = useState<PublicAlbumPhoto[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ROUTES.API.PUBLIC_ALBUM(code));
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notFound');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data: { trip_name: string; photos: PublicAlbumPhoto[] } = await res.json();
        if (cancelled) return;
        setTripName(data.trip_name);
        setPhotos(data.photos);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const formatDate = useCallback(
    (iso: string | null) => {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return '';
      }
    },
    [locale]
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'notFound' || status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground">
        <Images className="h-10 w-10" />
        <p>{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{tripName || t('title')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('photoCount', { count: photos.length })}
            </span>
            {/* 公開頁無主導覽列，語言切換放這裡 */}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-6">
        {photos.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Images className="h-10 w-10" />
            <p>{t('empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setIndex(i)}
                className="relative aspect-square overflow-hidden rounded-md bg-muted"
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
        )}
      </main>

      {index !== null && photos[index] && (
        <PublicPhotoLightbox
          photos={photos}
          index={index}
          onIndexChange={setIndex}
          formatDate={formatDate}
          altFallback={t('photoAlt')}
        />
      )}
    </div>
  );
}

/** 唯讀 lightbox：大圖（消毒副本）＋說明＋日期，鍵盤／按鈕上一張下一張。 */
function PublicPhotoLightbox({
  photos,
  index,
  onIndexChange,
  formatDate,
  altFallback,
}: {
  photos: PublicAlbumPhoto[];
  index: number;
  onIndexChange: (i: number | null) => void;
  formatDate: (iso: string | null) => string;
  altFallback: string;
}) {
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onIndexChange(null);
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndexChange]);

  const dateLabel = formatDate(photo.taken_at);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={() => onIndexChange(null)}
    >
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={() => onIndexChange(null)}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
        <img
          src={photo.url}
          alt={photo.caption || altFallback}
          className="max-h-[80vh] max-w-full object-contain"
        />
        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {(photo.caption || dateLabel) && (
        <div
          className="space-y-1 px-4 py-4 text-center text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {photo.caption && <p className="text-sm">{photo.caption}</p>}
          {dateLabel && <p className="text-xs text-white/60">{dateLabel}</p>}
        </div>
      )}
    </div>
  );
}
