'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, ChevronLeft, ChevronRight, Download, MapPin, Trash2 } from 'lucide-react';
import type { ItineraryDay, TripPhoto } from '@/types';
import { intlLocale } from '@/lib/relativeTime';
import { PHOTO_CAPTION_MAX } from '@/lib/validation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/common';

/** Radix 的 Select 不接受空字串 value，故「未關聯」用哨兵值表示。 */
const NO_DAY = 'none';

/**
 * 方向鍵事件是否來自輸入中的元素。說明欄打字（含 ←/→ 移動游標）與 Select 的鍵盤選單
 * 都不該順便切換相片——lightbox 的全域 keydown 監聽會收到它們，得在這裡讓開。
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) return true;
  return !!el.closest('[role="combobox"], [role="listbox"]');
}

/**
 * 說明編輯器。草稿是**這張相片的**狀態，故由呼叫端以 `key={photo.id}` 掛載——
 * 換一張就是換一個元件實例，草稿自然重置，不需要 effect 去同步 props → state
 * （那正是 React 文件說「不要這樣做」的模式，也會被 react-hooks/set-state-in-effect 擋下）。
 */
function CaptionEditor({
  caption,
  saving,
  onSave,
}: {
  caption: string;
  saving: boolean;
  onSave: (caption: string) => void;
}) {
  const t = useTranslations('album');
  const tCommon = useTranslations('common');
  const [draft, setDraft] = useState(caption);

  const dirty = draft.trim() !== caption;

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('captionPlaceholder')}
        maxLength={PHOTO_CAPTION_MAX}
        rows={2}
        aria-label={t('caption')}
      />
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(caption)}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => onSave(draft.trim())}>
            {t('saveCaption')}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 相簿 lightbox：Dialog 放大檢視 + 上一張/下一張（含鍵盤 ←/→）+ 下載 + 刪除，
 * 成員另可編輯說明與關聯行程日（PLAN-PHOTOS Phase 2）。
 *
 * 放大圖用 photo.url（顯示檔，自帶完整 EXIF）而非 thumb_url——下載按鈕直接連到它，
 * 存回手機後 Apple 照片／Google 相簿才讀得到地點，不必另打 action 拿 URL。
 *
 * index 由呼叫端（頁面）持有，這裡只負責上一張/下一張的換算與鍵盤事件；
 * 刪除採兩段式：先跳 ConfirmDialog（同 repo 既有刪除慣例），確認後才呼叫 onDelete。
 */
export function PhotoLightbox({
  photos,
  days = [],
  index,
  onIndexChange,
  onDelete,
  onUpdate,
  deleting = false,
  saving = false,
  canEdit = false,
}: {
  photos: TripPhoto[];
  /** 可關聯的行程日（依 day_number 排序，由呼叫端提供）。空陣列＝此旅程還沒有行程。 */
  days?: ItineraryDay[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /**
   * 編輯用的回呼。省略＝**唯讀檢視**（行程日卡片就是這樣用的：那裡只放大看，
   * 編輯與刪除留在相簿頁一處，不散到兩個頁面各維護一套狀態）。
   */
  onDelete?: (photo: TripPhoto) => void;
  onUpdate?: (
    photo: TripPhoto,
    data: { caption?: string; itinerary_day_id?: string | null }
  ) => void;
  deleting?: boolean;
  saving?: boolean;
  canEdit?: boolean;
}) {
  const t = useTranslations('album');
  const tItinerary = useTranslations('itinerary');
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
      if (isTypingTarget(e.target)) return;
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
    onDelete?.(photo);
  };

  const editable = canEdit && !!onUpdate;
  const deletable = canEdit && !!onDelete;

  const dayLabel = (day: ItineraryDay) =>
    `${tItinerary('dayLabel', { dayNumber: day.day_number })}・${day.title}`;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="sr-only">{t('lightboxTitle')}</DialogTitle>
          {photo && (
            <div className="flex max-h-[90vh] flex-col overflow-y-auto">
              <div className="relative flex shrink-0 items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- 簽名 URL 為動態短效，不走 next/image 遠端設定 */}
                <img
                  src={photo.url}
                  alt={photo.caption || t('photoAlt')}
                  className="max-h-[60vh] w-full object-contain"
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
                  {deletable && (
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

              <div className="flex flex-col gap-3 border-t p-3">
                {editable ? (
                  <CaptionEditor
                    key={photo.id}
                    caption={photo.caption}
                    saving={saving}
                    onSave={(caption) => onUpdate?.(photo, { caption })}
                  />
                ) : (
                  photo.caption && <p className="whitespace-pre-line text-sm">{photo.caption}</p>
                )}

                {/* 關聯行程日：沒有行程日可關聯時整段不顯示（給空選單只會讓人困惑） */}
                {editable && days.length > 0 && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Select
                      value={photo.itinerary_day_id ?? NO_DAY}
                      disabled={saving}
                      onValueChange={(v) =>
                        onUpdate?.(photo, { itinerary_day_id: v === NO_DAY ? null : v })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label={t('itineraryDay')}>
                        <SelectValue placeholder={t('noItineraryDay')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_DAY}>{t('noItineraryDay')}</SelectItem>
                        {days.map((day) => (
                          <SelectItem key={day.id} value={day.id}>
                            {dayLabel(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/*
                  座標來源（exif／itinerary／manual）：讓「這張為什麼釘在這」可解釋——
                  行程日借來的座標是整天共用的城市中心，不是這張相片拍攝的地點。
                */}
                {photo.location && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="tabular-nums">
                      {photo.location.lat.toFixed(4)}, {photo.location.lon.toFixed(4)}
                    </span>
                    <span>・{t(`locationSource.${photo.location.source}`)}</span>
                  </p>
                )}
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
