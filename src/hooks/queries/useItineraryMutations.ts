'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createItineraryDay, updateItineraryDay, deleteItineraryDay } from '@/actions';
import type { ActionResult } from '@/actions';
import { tripKeys } from './keys';
import type { ActivityType, ExpenseAttachment, Location } from '@/types';

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/** 送往 createItineraryDay / updateItineraryDay 的單一活動 payload（snake_case，對應 activitySchema）。 */
export interface ActivityPayload {
  time: string | null;
  end_time: string | null;
  title: string;
  type: ActivityType;
  location?: Location | null;
  note: string;
  confirmation_code: string;
  /** 票券附件（只帶 key + 中繼資料；server 端以 headObject 驗證）。 */
  attachments?: ExpenseAttachment[];
}

interface DayInput {
  title: string;
  content: string;
  location?: Location | null;
  activities?: ActivityPayload[];
}

/** 更新時各欄位皆可省略（只送有改的；action 對 undefined 欄位不動），例如只追加一筆活動。 */
type UpdateDayInput = Partial<DayInput>;

/**
 * Itinerary create/update/delete mutations for a trip.
 * Each invalidates the trip's itinerary query on success, triggering a
 * background refetch (replacing the manual reload() call).
 */
export function useItineraryMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidateItinerary = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
  const invalidatePhotos = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.photos(tripId) });

  const create = useMutation({
    mutationFn: (data: DayInput) => unwrap(createItineraryDay(tripId, data)),
    onSuccess: () => {
      invalidateItinerary();
      invalidatePhotos();
    },
  });

  const update = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: UpdateDayInput }) =>
      unwrap(updateItineraryDay(tripId, dayId, data)),
    onSuccess: (_day, { data }) => {
      invalidateItinerary();
      // 行程日地點變動會同步借用此地點的相片座標。
      if (data.location !== undefined) invalidatePhotos();
    },
  });

  const remove = useMutation({
    mutationFn: (dayId: string) => unwrap(deleteItineraryDay(tripId, dayId)),
    onSuccess: () => {
      invalidateItinerary();
      invalidatePhotos();
    },
  });

  return { create, update, remove };
}
