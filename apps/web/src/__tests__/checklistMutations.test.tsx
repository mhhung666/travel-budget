import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Checklist } from '@/types';
import { tripKeys } from '@/hooks/queries/keys';

const updateChecklistItem = vi.fn();

vi.mock('@/actions', () => ({
  createChecklist: vi.fn(),
  createChecklistWithItems: vi.fn(),
  updateChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  addChecklistItem: vi.fn(),
  updateChecklistItem: (...args: unknown[]) => updateChecklistItem(...args),
  removeChecklistItem: vi.fn(),
}));

import { useChecklistMutations } from '@/hooks/queries/useChecklistMutations';

const TRIP_ID = 'trip-1';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';
const VIEWER_ID = 'user-1';

const initialChecklist: Checklist = {
  id: LIST_ID,
  trip_id: TRIP_ID,
  kind: 'todo',
  title: 'Before departure',
  items: [
    {
      id: ITEM_ID,
      text: 'Passport',
      done: false,
      done_by: [],
      assignee_id: null,
      assignee_name: null,
    },
  ],
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useChecklistMutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(tripKeys.checklists(TRIP_ID), [initialChecklist]);
    queryClient.setQueryData(tripKeys.currentUser, { id: VIEWER_ID });
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('checks an item immediately and reconciles without invalidating the list query', async () => {
    const response = deferred<{
      success: true;
      data: Checklist;
    }>();
    updateChecklistItem.mockReturnValue(response.promise);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useChecklistMutations(TRIP_ID), { wrapper });

    act(() => {
      result.current.updateItem.mutate({
        checklistId: LIST_ID,
        itemId: ITEM_ID,
        data: { done: true },
      });
    });

    await waitFor(() => {
      const item = queryClient.getQueryData<Checklist[]>(tripKeys.checklists(TRIP_ID))?.[0]
        .items[0];
      expect(item).toMatchObject({ done: true, done_by: [VIEWER_ID] });
      expect(result.current.pendingItemIds.has(ITEM_ID)).toBe(true);
    });

    response.resolve({
      success: true,
      data: {
        ...initialChecklist,
        updated_at: '2026-09-02T00:00:00.000Z',
        items: [{ ...initialChecklist.items[0], done: true, done_by: [VIEWER_ID] }],
      },
    });

    await waitFor(() => {
      expect(result.current.pendingItemIds.has(ITEM_ID)).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  it('restores the previous item when the server rejects the update', async () => {
    const response = deferred<never>();
    updateChecklistItem.mockReturnValue(response.promise);
    const { result } = renderHook(() => useChecklistMutations(TRIP_ID), { wrapper });

    act(() => {
      result.current.updateItem.mutate({
        checklistId: LIST_ID,
        itemId: ITEM_ID,
        data: { done: true },
      });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<Checklist[]>(tripKeys.checklists(TRIP_ID))?.[0].items[0].done
      ).toBe(true)
    );

    response.reject(new Error('network'));

    await waitFor(() =>
      expect(
        queryClient.getQueryData<Checklist[]>(tripKeys.checklists(TRIP_ID))?.[0].items[0].done
      ).toBe(false)
    );
  });
});
