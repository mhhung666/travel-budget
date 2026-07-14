'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotes, createNote, updateNote, deleteNote, planNote } from '@/actions';
import type { ActionResult } from '@/actions';
import type { TripNote, ExpenseAttachment } from '@/types';
import { tripKeys } from './keys';

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * 旅程隨手記（釘選優先、新到舊，排序由伺服器決定）。**成員限定**：比照
 * useActivityLog 直接呼叫 action、不走 fetchWithPublicFallback——沒有對應的
 * 公開路由就是「分享頁看不到隨手記」的保證。失敗回空陣列（不擋頁面）。
 */
export function useNotes(tripId: string) {
  return useQuery({
    queryKey: tripKeys.notes(tripId),
    queryFn: async (): Promise<TripNote[]> => {
      const res = await getNotes(tripId);
      return res.success ? res.data : [];
    },
    enabled: !!tripId,
  });
}

interface CreateNoteData {
  text: string;
  attachments?: ExpenseAttachment[];
}

interface UpdateNoteData {
  text?: string;
  pinned?: boolean;
  attachments?: ExpenseAttachment[];
}

/**
 * 隨手記 mutations。create/remove/plan 為 invalidate-on-success 模式（同
 * useChecklistMutations）；`update` 改為 optimistic——內文 task checkbox
 * 點了要即時打勾（roundtrip 後才勾會像壞掉），釘選切換也順帶受惠。
 * `plan`（轉成行程活動）另外 invalidate 行程查詢，讓行程分頁同步出現新活動。
 * Online-only：離線時失敗由呼叫端 toast（僅支出建立有離線佇列）。
 */
export function useNoteMutations(tripId: string) {
  const queryClient = useQueryClient();
  const notesKey = tripKeys.notes(tripId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: notesKey });

  const create = useMutation({
    mutationFn: ({ text, attachments }: CreateNoteData) =>
      unwrap(createNote(tripId, { text, attachments })),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: UpdateNoteData }) =>
      unwrap(updateNote(tripId, noteId, data)),
    // Optimistic：先改快取（只 patch text/pinned；attachments 等 server 回來），
    // 失敗回滾、結束後 invalidate 對回伺服器排序（釘選變更的重排交給 server）。
    onMutate: async ({ noteId, data }) => {
      await queryClient.cancelQueries({ queryKey: notesKey });
      const previous = queryClient.getQueryData<TripNote[]>(notesKey);
      queryClient.setQueryData<TripNote[]>(notesKey, (old) =>
        old?.map((n) =>
          n.id === noteId
            ? {
                ...n,
                ...(data.text !== undefined && { text: data.text }),
                ...(data.pinned !== undefined && { pinned: data.pinned }),
              }
            : n
        )
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(notesKey, ctx.previous);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (noteId: string) => unwrap(deleteNote(tripId, noteId)),
    onSuccess: invalidate,
  });

  const plan = useMutation({
    mutationFn: ({ noteId, dayId }: { noteId: string; dayId: string }) =>
      unwrap(planNote(tripId, noteId, { day_id: dayId })),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
    },
  });

  return { create, update, remove, plan };
}
