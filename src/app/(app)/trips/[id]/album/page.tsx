'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Images, Trash2 } from 'lucide-react';
import type { TripPhoto } from '@/types';
import { ROUTES } from '@/constants/routes';
import { usePhotos, usePhotoMutations, useItinerary, useTripMembership } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { ItinerarySkeleton } from '@/components/skeletons';
import { ConfirmDialog, EmptyState, ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  AlbumShareDialog,
  PhotoGrid,
  PhotoLightbox,
  PhotoUploadButton,
} from '@/components/trips/detail/album';

/**
 * 旅程相簿分頁：grid 瀏覽 + lightbox 放大／下載／刪除／編輯說明／關聯行程日 + 上傳
 * + 批次選取刪除（PLAN-PHOTOS Phase 1／2）。
 * 定位比照隨手記——trip-scoped、成員共享，任何成員可上傳／編輯／刪除。頁首由行程空間殼提供。
 * 沒有對應公開路由，非成員造訪時 usePhotos 回空陣列，上傳／編輯／刪除也一併隱藏（同 notes 頁）。
 */
export default function AlbumPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations('album');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: photos = [], isLoading: loading, isError } = usePhotos(tripId);
  // 行程日清單供 lightbox 的關聯選單；非成員時 useItinerary 走公開 fallback，選單本來就不顯示。
  const { data: days = [] } = useItinerary(tripId);
  const { isMember } = useTripMembership(tripId);
  const m = usePhotoMutations(tripId);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 選取模式與已選集合是頁面層狀態：批次刪除、全選、離開選取都在這裡收斂。
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);

  /** Fire a mutation and surface any failure as a destructive toast. */
  const guard = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (err: unknown) {
      toast({
        title: tCommon('errorTitle'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (photo: TripPhoto) => {
    // 先關 lightbox 再送刪除：陣列會因刪除縮短，index 若還指著舊位置會對不上新內容。
    setLightboxIndex(null);
    guard(m.remove.mutateAsync([photo.id]));
  };

  const handleUpdate = (
    photo: TripPhoto,
    data: { caption?: string; itinerary_day_id?: string | null }
  ) => {
    guard(m.update.mutateAsync({ photoId: photo.id, data }));
  };

  const toggleSelect = (photoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const allSelected = photos.length > 0 && selected.size === photos.length;
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)));
  };

  const confirmBatchDelete = async () => {
    setConfirmingBatchDelete(false);
    const ids = [...selected];
    exitSelection();
    await guard(m.remove.mutateAsync(ids));
  };

  if (loading) {
    return <ItinerarySkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('loadFailed')}
        onBack={() => router.push(ROUTES.TRIP_DETAIL(tripId))}
        backText={t('backToTrip')}
      />
    );
  }

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-5xl px-4 py-4 sm:px-6">
      {isMember && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {selectionMode ? (
            <>
              <span className="mr-auto text-sm text-muted-foreground">
                {t('selectedCount', { count: selected.size })}
              </span>
              <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                {allSelected ? t('deselectAll') : t('selectAll')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={selected.size === 0 || m.remove.isPending}
                onClick={() => setConfirmingBatchDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t('delete')}
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelection}>
                {tCommon('cancel')}
              </Button>
            </>
          ) : (
            <>
              <AlbumShareDialog tripId={tripId} />
              {photos.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
                  {t('select')}
                </Button>
              )}
              <PhotoUploadButton
                tripId={tripId}
                pending={m.add.isPending}
                // 回傳 promise：上傳器要等這批入庫完才傳下一批（見 uploadPhotoFilesInBatches）
                onUploaded={(items) => guard(m.add.mutateAsync(items))}
              />
            </>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <EmptyState
          icon={Images}
          title={t('emptyState')}
          description={isMember ? t('emptyStateHint') : undefined}
        />
      ) : (
        <PhotoGrid
          photos={photos}
          onSelect={setLightboxIndex}
          selectionMode={selectionMode}
          selectedIds={selected}
          onToggleSelect={toggleSelect}
        />
      )}

      <PhotoLightbox
        photos={photos}
        days={days}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
        deleting={m.remove.isPending}
        saving={m.update.isPending}
        canEdit={isMember}
      />

      <ConfirmDialog
        open={confirmingBatchDelete}
        title={t('deleteSelectedConfirmTitle', { count: selected.size })}
        message={t('deleteConfirmMessage')}
        severity="error"
        confirmText={t('delete')}
        loading={m.remove.isPending}
        onConfirm={confirmBatchDelete}
        onCancel={() => setConfirmingBatchDelete(false)}
      />
    </div>
  );
}
