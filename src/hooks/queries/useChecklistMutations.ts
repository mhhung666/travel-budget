'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
} from '@/actions';
import type { ActionResult } from '@/actions';
import { tripKeys } from './keys';

/** Unwraps an ActionResult, throwing on failure so React Query's onError fires. */
async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

interface AddItemInput {
  text: string;
  assignee_id?: string | null;
}

interface UpdateItemInput {
  text?: string;
  done?: boolean;
  assignee_id?: string | null;
}

/**
 * Checklist (list + item) mutations for a trip. Every mutation invalidates the
 * trip's checklists query on success, triggering a background refetch — the same
 * invalidate-on-success pattern as {@link useItineraryMutations}.
 */
export function useChecklistMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tripKeys.checklists(tripId) });

  const createList = useMutation({
    mutationFn: (title: string) => unwrap(createChecklist(tripId, { title })),
    onSuccess: invalidate,
  });

  const renameList = useMutation({
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string }) =>
      unwrap(updateChecklist(tripId, checklistId, { title })),
    onSuccess: invalidate,
  });

  const removeList = useMutation({
    mutationFn: (checklistId: string) => unwrap(deleteChecklist(tripId, checklistId)),
    onSuccess: invalidate,
  });

  const addItem = useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: string; data: AddItemInput }) =>
      unwrap(addChecklistItem(tripId, checklistId, data)),
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: ({
      checklistId,
      itemId,
      data,
    }: {
      checklistId: string;
      itemId: string;
      data: UpdateItemInput;
    }) => unwrap(updateChecklistItem(tripId, checklistId, itemId, data)),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      unwrap(removeChecklistItem(tripId, checklistId, itemId)),
    onSuccess: invalidate,
  });

  return { createList, renameList, removeList, addItem, updateItem, removeItem };
}
