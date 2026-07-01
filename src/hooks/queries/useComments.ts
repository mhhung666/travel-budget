'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getComments, getCommentCounts, createComment, deleteComment } from '@/actions';
import type { CreateCommentInput } from '@/lib/validation';
import type { CommentDto } from '@/types';
import { unwrap } from '@/lib/offlineMutations';
import { tripKeys } from './keys';

/**
 * 某旅程內所有支出的留言數（{ expenseId: count }）。隨支出列表一起載入，供每張
 * 支出卡片顯示「留言 (N)」而不必展開；失敗回空物件（badge 只是不顯示數字）。
 */
export function useCommentCounts(tripId: string, enabled = true) {
  return useQuery({
    queryKey: tripKeys.commentCounts(tripId),
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await getCommentCounts(tripId);
      return res.success ? res.data : {};
    },
    enabled: enabled && !!tripId,
  });
}

/**
 * 單筆支出的留言串（舊到新）。只在該支出卡片的留言區被展開時才 enable，避免列表
 * 裡每張卡都預先各發一次請求。
 */
export function useExpenseComments(tripId: string, expenseId: string, enabled: boolean) {
  return useQuery({
    queryKey: tripKeys.comments(tripId, expenseId),
    queryFn: async (): Promise<CommentDto[]> => {
      const res = await getComments(tripId, expenseId);
      return res.success ? res.data : [];
    },
    enabled: enabled && !!tripId && !!expenseId,
  });
}

/**
 * 新增/刪除留言。成功後同時 invalidate 該支出的留言串與整趟旅程的留言數，
 * 讓 badge 與展開的討論串保持一致。
 */
export function useCommentMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = (expenseId: string) => {
    queryClient.invalidateQueries({ queryKey: tripKeys.comments(tripId, expenseId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.commentCounts(tripId) });
  };

  const create = useMutation({
    mutationFn: ({ expenseId, input }: { expenseId: string; input: CreateCommentInput }) =>
      unwrap(createComment(tripId, expenseId, input)),
    onSuccess: (_data, vars) => invalidate(vars.expenseId),
  });

  const remove = useMutation({
    mutationFn: ({ expenseId, commentId }: { expenseId: string; commentId: string }) =>
      unwrap(deleteComment(tripId, expenseId, commentId)),
    onSuccess: (_data, vars) => invalidate(vars.expenseId),
  });

  return { create, remove };
}
