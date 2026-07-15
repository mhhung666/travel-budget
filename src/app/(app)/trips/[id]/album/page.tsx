'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Images } from 'lucide-react';
import type { TripPhoto } from '@/types';
import { ROUTES } from '@/constants/routes';
import { usePhotos, usePhotoMutations, useTripMembership } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { ItinerarySkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState } from '@/components/common';
import { PhotoGrid, PhotoLightbox, PhotoUploadButton } from '@/components/trips/detail/album';

/**
 * 旅程相簿分頁：grid 瀏覽 + lightbox 放大／下載／刪除 + 上傳（PLAN-PHOTOS Phase 1）。
 * 定位比照隨手記——trip-scoped、成員共享，任何成員可上傳／刪除。頁首由行程空間殼提供。
 * 沒有對應公開路由，非成員造訪時 usePhotos 回空陣列，上傳／刪除也一併隱藏（同 notes 頁）。
 */
export default function AlbumPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations('album');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: photos = [], isLoading: loading, isError } = usePhotos(tripId);
  const { isMember } = useTripMembership(tripId);
  const m = usePhotoMutations(tripId);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    guard(m.remove.mutateAsync(photo.id));
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
        <div className="mb-4 flex justify-end">
          <PhotoUploadButton
            tripId={tripId}
            pending={m.add.isPending}
            // 回傳 promise：上傳器要等這批入庫完才傳下一批（見 uploadPhotoFilesInBatches）
            onUploaded={(items) => guard(m.add.mutateAsync(items))}
          />
        </div>
      )}

      {photos.length === 0 ? (
        <EmptyState
          icon={Images}
          title={t('emptyState')}
          description={isMember ? t('emptyStateHint') : undefined}
        />
      ) : (
        <PhotoGrid photos={photos} onSelect={setLightboxIndex} />
      )}

      <PhotoLightbox
        photos={photos}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onDelete={handleDelete}
        deleting={m.remove.isPending}
        canDelete={isMember}
      />
    </div>
  );
}
