'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createItineraryDay,
  updateItineraryDay,
  deleteItineraryDay,
  mutateItineraryActivity,
} from '@/actions';
import type { ActionResult, ErrorCode } from '@/actions';
import { tripKeys } from './keys';
import type { ActivityType, ExpenseAttachment, Location } from '@/types';
import { MAX_ACTIVITIES_PER_DAY } from '@/lib/itineraryLimits';
import { ActionQueryError, unwrapActionResult } from '@/lib/actionQuery';
import { useTranslations } from 'next-intl';
import type { ItineraryDayTargetInput, MutateItineraryActivityInput } from '@/lib/validation';
import { useToast } from '@/hooks/use-toast';

/** 這些失敗由新增對話框就地顯示在日期欄位旁，不另外彈 toast（草稿必須留著改日期）。 */
const CREATE_FIELD_ERROR_CODES = new Set<ErrorCode>([
  'DAY_ALREADY_EXISTS',
  'DATE_OUTSIDE_TRIP',
  'TRIP_DATES_CHANGED',
  'TRIP_START_DATE_REQUIRED',
]);

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  return unwrapActionResult(await p);
}

/** 送往 createItineraryDay / updateItineraryDay 的單一活動 payload（snake_case，對應 activitySchema）。 */
export interface ActivityPayload {
  /** 既有子文件 ID；新增活動明確傳 null。 */
  id: string | null;
  time: string | null;
  end_time: string | null;
  title: string;
  type: ActivityType;
  location?: Location | null;
  location_name: string;
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
  /** 新增時的目標日期／第幾天；server 依此重算 dayNumber，不採信前端預覽。 */
  target?: ItineraryDayTargetInput;
}

/** 更新欄位可省略；必須攜帶開啟表單時的 revision，不以最新快取替換舊草稿的 token。 */
type UpdateDayInput = Partial<DayInput> & { expected_revision: number };

/**
 * Itinerary create/update/delete mutations for a trip.
 * Each invalidates the trip's itinerary query on success, triggering a
 * background refetch (replacing the manual reload() call).
 */
export function useItineraryMutations(tripId: string) {
  const t = useTranslations('itinerary');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidateItinerary = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
  const invalidatePhotos = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.photos(tripId) });

  const reportUpdateError = (error: Error) => {
    const conflict = error instanceof ActionQueryError && error.code === 'CONFLICT';
    if (conflict || (error instanceof ActionQueryError && error.code === 'NOT_FOUND')) {
      void invalidateItinerary();
    }
    toast({
      description:
        error instanceof ActionQueryError && error.code === 'ACTIVITY_LIMIT'
          ? t('activityLimit', { max: MAX_ACTIVITIES_PER_DAY })
          : t(conflict ? 'updateConflict' : 'updateFailed'),
      variant: 'destructive',
    });
  };

  // 新增失敗時要讓使用者能改選日期：同日被搶走就刷新行程日、旅程改期就刷新旅程資料，
  // 錯誤訊息由對話框就地顯示（保留草稿），這裡只負責讓可用日期重新算對。
  const reportCreateError = (error: Error) => {
    const code = error instanceof ActionQueryError ? error.code : undefined;
    if (code === 'DAY_ALREADY_EXISTS') void invalidateItinerary();
    if (
      code === 'TRIP_DATES_CHANGED' ||
      code === 'DATE_OUTSIDE_TRIP' ||
      code === 'TRIP_START_DATE_REQUIRED'
    ) {
      void queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      void invalidateItinerary();
    }
    if (!code || !CREATE_FIELD_ERROR_CODES.has(code)) reportUpdateError(error);
  };

  const create = useMutation({
    mutationFn: (data: DayInput) => unwrap(createItineraryDay(tripId, data)),
    onError: reportCreateError,
    onSuccess: () => {
      invalidateItinerary();
      invalidatePhotos();
    },
  });

  const update = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: UpdateDayInput }) =>
      unwrap(updateItineraryDay(tripId, dayId, data)),
    onError: reportUpdateError,
    onSuccess: (_day, { data }) => {
      invalidateItinerary();
      // 行程日地點變動會同步借用此地點的相片座標。
      if (data.location !== undefined) invalidatePhotos();
    },
  });

  const mutateActivity = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: MutateItineraryActivityInput }) =>
      unwrap(mutateItineraryActivity(tripId, dayId, data)),
    onError: reportUpdateError,
    onSuccess: () => {
      void invalidateItinerary();
    },
  });

  const remove = useMutation({
    mutationFn: (dayId: string) => unwrap(deleteItineraryDay(tripId, dayId)),
    onSuccess: () => {
      invalidateItinerary();
      invalidatePhotos();
      void queryClient.invalidateQueries({ queryKey: tripKeys.expenses(tripId) });
      void queryClient.invalidateQueries({ queryKey: tripKeys.stats(tripId) });
    },
  });

  return { create, update, remove, mutateActivity };
}
