'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTripPhotos, addTripPhotos, updatePhoto, deletePhoto } from '@/actions';
import type { ActionResult } from '@/actions';
import type { TripPhoto } from '@/types';
import type { PhotoItemInput } from '@/lib/validation';
import { tripKeys } from './keys';

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * 旅程相簿（拍攝時間新到舊，排序由伺服器決定）。**成員限定**：比照 useNotes 直接
 * 呼叫 action、不走 fetchWithPublicFallback——沒有對應的公開路由，就是「分享頁看不到
 * 相簿」的保證（Phase 4 的公開相簿會是另一條路由、另一套不含位置的 DTO）。
 * 失敗回空陣列（不擋頁面）。
 *
 * 注意 DTO 裡的 `url`／`thumb_url` 是**有時效**的簽名 URL（見 storage.ts 的
 * presignGetStable）。快取久了 URL 會過期，故設 staleTime 讓它定期重取；窗口對齊
 * 保證重取回來的 URL 在同一窗口內是同一個字串，SW 快取不會因此失效。
 */
export function usePhotos(tripId: string) {
  return useQuery({
    queryKey: tripKeys.photos(tripId),
    queryFn: async (): Promise<TripPhoto[]> => {
      const res = await getTripPhotos(tripId);
      return res.success ? res.data : [];
    },
    enabled: !!tripId,
    staleTime: 30 * 60 * 1000,
  });
}

interface UpdatePhotoData {
  caption?: string;
  itinerary_day_id?: string | null;
  location?: { lat: number; lon: number } | null;
}

/**
 * 相簿 mutations。全為 invalidate-on-success（同 useChecklistMutations）：相片入庫後
 * 伺服器要重新簽 URL、重排順序，optimistic 沒有意義——本機沒有簽名 URL 可以先顯示。
 *
 * `add` 收的是**已經直傳完 R2** 的項目（見 lib/photoUpload.ts）；傳檔與入庫刻意分開，
 * 傳了一半失敗時，成功的那些仍然入得了庫。
 * Online-only：離線時失敗由呼叫端 toast（僅支出建立有離線佇列）。
 */
export function usePhotoMutations(tripId: string) {
  const queryClient = useQueryClient();
  const photosKey = tripKeys.photos(tripId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: photosKey });

  const add = useMutation({
    mutationFn: (items: PhotoItemInput[]) => unwrap(addTripPhotos(tripId, { items })),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ photoId, data }: { photoId: string; data: UpdatePhotoData }) =>
      unwrap(updatePhoto(tripId, photoId, data)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => unwrap(deletePhoto(tripId, photoId)),
    onSuccess: invalidate,
  });

  return { add, update, remove };
}
