'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTripPhotos, addTripPhotos, updatePhoto, deletePhotos } from '@/actions';
import type { ActionResult } from '@/actions';
import type { TripPhoto } from '@/types';
import type { PhotoItemInput } from '@/lib/validation';
import { tripKeys } from './keys';
import { unwrapActionResult } from '@/lib/actionQuery';

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
 * 失敗交給 Query error 狀態，不當成空資料。
 *
 * `enabled` 供非相簿頁的呼叫端把「已知不是成員」的情形擋在前面（行程頁的公開分享訪客
 * 就是這樣：不擋的話每次瀏覽分享頁都會多打一趟必定回 UNAUTHORIZED 的 action）。
 *
 * 注意 DTO 裡的 `url`／`thumb_url` 是**有時效**的簽名 URL（見 storage.ts 的
 * presignGetStable）。快取久了 URL 會過期，故設 staleTime 讓它定期重取；窗口對齊
 * 保證重取回來的 URL 在同一窗口內是同一個字串，SW 快取不會因此失效。
 */
export function usePhotos(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripKeys.photos(tripId),
    queryFn: async (): Promise<TripPhoto[]> => {
      const res = await getTripPhotos(tripId);
      return unwrapActionResult(res);
    },
    enabled: !!tripId && enabled,
    staleTime: 30 * 60 * 1000,
  });
}

interface UpdatePhotoData {
  caption?: string;
  itinerary_day_id?: string | null;
  location?: { lat: number; lon: number } | null;
}

/**
 * 編輯／刪除成功後刷新相簿。新上傳以 acceptUploaded 合併伺服器確認的 DTO，
 * 整個佇列結束才刷新；保留 add 供既有直傳介面使用。離線不新增照片。
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

  // 收陣列（單張＝一個元素）：批次選取刪 50 張時只打一次 action，見 deletePhotos。
  const remove = useMutation({
    mutationFn: (photoIds: string[]) => unwrap(deletePhotos(tripId, { photo_ids: photoIds })),
    onSuccess: invalidate,
  });

  const acceptUploaded = (photo: TripPhoto) => {
    // Cancel an older snapshot before merging a confirmed DTO; refresh once after the queue.
    void queryClient.cancelQueries({ queryKey: photosKey });
    queryClient.setQueryData<TripPhoto[]>(photosKey, (current = []) =>
      [...current.filter((item) => item.id !== photo.id), photo].sort(
        (a, b) =>
          (b.taken_at ? Date.parse(b.taken_at) : 0) - (a.taken_at ? Date.parse(a.taken_at) : 0) ||
          Date.parse(b.created_at) - Date.parse(a.created_at)
      )
    );
  };
  return { add, update, remove, acceptUploaded };
}
