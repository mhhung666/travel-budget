'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import {
  createChecklist,
  createChecklistWithItems,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
} from '@/actions';
import type { ActionResult } from '@/actions';
import type { Checklist, ChecklistItem, ChecklistKind, Member } from '@/types';
import { tripKeys } from './keys';

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

interface UpdateItemVariables {
  checklistId: string;
  itemId: string;
  data: UpdateItemInput;
}

interface ChecklistMutationContext {
  previous: Checklist[] | undefined;
}

const optimisticId = () => `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Checklist mutations update the local cache immediately. Errors restore the
 * snapshot; successful responses reconcile only the affected list or item so
 * a broad refetch cannot overwrite another optimistic edit.
 */
export function useChecklistMutations(tripId: string) {
  const queryClient = useQueryClient();
  const checklistsKey = tripKeys.checklists(tripId);
  const updateItemMutationKey = ['checklist', tripId, 'updateItem'] as const;

  const beginOptimisticUpdate = async (): Promise<ChecklistMutationContext> => {
    await queryClient.cancelQueries({ queryKey: checklistsKey });
    return { previous: queryClient.getQueryData<Checklist[]>(checklistsKey) };
  };

  const rollback = (_error: unknown, _variables: unknown, context?: ChecklistMutationContext) => {
    if (context?.previous !== undefined) {
      queryClient.setQueryData(checklistsKey, context.previous);
    }
  };

  const patchChecklist = (checklistId: string, updater: (checklist: Checklist) => Checklist) => {
    queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) =>
      old.map((checklist) => (checklist.id === checklistId ? updater(checklist) : checklist))
    );
  };

  const createList = useMutation({
    mutationFn: (title: string) => unwrap(createChecklist(tripId, { title })),
    onMutate: async (title) => {
      const context = await beginOptimisticUpdate();
      const now = new Date().toISOString();
      const id = optimisticId();
      queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) => [
        ...old,
        {
          id,
          trip_id: tripId,
          kind: 'todo',
          title,
          items: [],
          created_at: now,
          updated_at: now,
        },
      ]);
      return { ...context, optimisticId: id };
    },
    onError: rollback,
    onSuccess: (created, _title, context) => {
      queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) =>
        old.map((checklist) => (checklist.id === context.optimisticId ? created : checklist))
      );
    },
  });

  const createListWithItems = useMutation({
    mutationFn: ({ title, kind, items }: { title: string; kind: ChecklistKind; items: string[] }) =>
      unwrap(createChecklistWithItems(tripId, { title, kind, items })),
    onMutate: async ({ title, kind, items }) => {
      const context = await beginOptimisticUpdate();
      const now = new Date().toISOString();
      const id = optimisticId();
      queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) => [
        ...old,
        {
          id,
          trip_id: tripId,
          kind,
          title,
          items: items.map((text) => ({
            id: optimisticId(),
            text,
            done: false,
            done_by: [],
            assignee_id: null,
            assignee_name: null,
          })),
          created_at: now,
          updated_at: now,
        },
      ]);
      return { ...context, optimisticId: id };
    },
    onError: rollback,
    onSuccess: (created, _variables, context) => {
      queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) =>
        old.map((checklist) => (checklist.id === context.optimisticId ? created : checklist))
      );
    },
  });

  const renameList = useMutation({
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string }) =>
      unwrap(updateChecklist(tripId, checklistId, { title })),
    onMutate: async ({ checklistId, title }) => {
      const context = await beginOptimisticUpdate();
      patchChecklist(checklistId, (checklist) => ({ ...checklist, title }));
      return context;
    },
    onError: rollback,
    onSuccess: (updated, { checklistId }) => {
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        title: updated.title,
        updated_at: updated.updated_at,
      }));
    },
  });

  const removeList = useMutation({
    mutationFn: (checklistId: string) => unwrap(deleteChecklist(tripId, checklistId)),
    onMutate: async (checklistId) => {
      const context = await beginOptimisticUpdate();
      queryClient.setQueryData<Checklist[]>(checklistsKey, (old = []) =>
        old.filter((checklist) => checklist.id !== checklistId)
      );
      return context;
    },
    onError: rollback,
  });

  const addItem = useMutation({
    mutationFn: ({ checklistId, data }: { checklistId: string; data: AddItemInput }) =>
      unwrap(addChecklistItem(tripId, checklistId, data)),
    onMutate: async ({ checklistId, data }) => {
      const context = await beginOptimisticUpdate();
      const id = optimisticId();
      const members = queryClient.getQueryData<Member[]>(tripKeys.members(tripId)) ?? [];
      const assignee = members.find((member) => member.id === data.assignee_id);
      const item: ChecklistItem = {
        id,
        text: data.text,
        done: false,
        done_by: [],
        assignee_id: data.assignee_id ?? null,
        assignee_name: assignee?.display_name ?? null,
      };
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        items: [...checklist.items, item],
      }));
      return { ...context, optimisticId: id };
    },
    onError: rollback,
    onSuccess: (updated, { checklistId }, context) => {
      const previousItems =
        context.previous?.find((checklist) => checklist.id === checklistId)?.items ?? [];
      const serverItem = updated.items.find(
        (item) => !previousItems.some((previousItem) => previousItem.id === item.id)
      );
      if (!serverItem) return;
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        updated_at: updated.updated_at,
        items: checklist.items.map((item) =>
          item.id === context.optimisticId ? serverItem : item
        ),
      }));
    },
  });

  const updateItem = useMutation({
    mutationKey: updateItemMutationKey,
    mutationFn: ({ checklistId, itemId, data }: UpdateItemVariables) =>
      unwrap(updateChecklistItem(tripId, checklistId, itemId, data)),
    onMutate: async ({ checklistId, itemId, data }) => {
      const context = await beginOptimisticUpdate();
      const currentUser = queryClient.getQueryData<{ id: string }>(tripKeys.currentUser);
      const members = queryClient.getQueryData<Member[]>(tripKeys.members(tripId)) ?? [];
      const assignee = members.find((member) => member.id === data.assignee_id);

      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        items: checklist.items.map((item) => {
          if (item.id !== itemId) return item;

          let doneBy = item.done_by;
          if (data.done !== undefined && checklist.kind === 'packing' && currentUser) {
            doneBy = data.done
              ? [...new Set([...doneBy, currentUser.id])]
              : doneBy.filter((id) => id !== currentUser.id);
          } else if (data.done !== undefined) {
            doneBy = data.done && currentUser ? [currentUser.id] : [];
          }

          return {
            ...item,
            ...(data.text !== undefined ? { text: data.text } : {}),
            ...(data.assignee_id !== undefined
              ? {
                  assignee_id: data.assignee_id,
                  assignee_name: assignee?.display_name ?? null,
                }
              : {}),
            ...(data.done !== undefined ? { done: doneBy.length > 0, done_by: doneBy } : {}),
          };
        }),
      }));
      return context;
    },
    onError: rollback,
    onSuccess: (updated, { checklistId, itemId }) => {
      const serverItem = updated.items.find((item) => item.id === itemId);
      if (!serverItem) return;
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        updated_at: updated.updated_at,
        items: checklist.items.map((item) => (item.id === itemId ? serverItem : item)),
      }));
    },
  });

  const removeItem = useMutation({
    mutationFn: ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      unwrap(removeChecklistItem(tripId, checklistId, itemId)),
    onMutate: async ({ checklistId, itemId }) => {
      const context = await beginOptimisticUpdate();
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        items: checklist.items.filter((item) => item.id !== itemId),
      }));
      return context;
    },
    onError: rollback,
    onSuccess: (updated, { checklistId }) => {
      patchChecklist(checklistId, (checklist) => ({
        ...checklist,
        updated_at: updated.updated_at,
      }));
    },
  });

  const pendingItemIds = new Set(
    useMutationState<UpdateItemVariables>({
      filters: { mutationKey: updateItemMutationKey, status: 'pending' },
      select: (mutation) => mutation.state.variables as UpdateItemVariables,
    }).map((variables) => variables.itemId)
  );

  return {
    createList,
    createListWithItems,
    renameList,
    removeList,
    addItem,
    updateItem,
    removeItem,
    pendingItemIds,
  };
}
