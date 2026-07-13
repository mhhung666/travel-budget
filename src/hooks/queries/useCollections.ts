'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCollections,
  createFlightRecord,
  updateFlightRecord,
  deleteFlightRecord,
  createStayRecord,
  updateStayRecord,
  deleteStayRecord,
} from '@/actions';
import type { ActionResult } from '@/actions';
import type { CollectionsData } from '@/types';
import type { CreateFlightRecordInput, CreateStayRecordInput } from '@/lib/validation';
import { collectionKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  // error 字串是穩定代碼（VALIDATION_ERROR / NOT_FOUND …），前端對 collections.errors.* i18n 表
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const EMPTY_COLLECTIONS: CollectionsData = { flights: [], stays: [], countries: [] };

/**
 * 旅行成就總覽（我的全部飛行/住宿紀錄＋造訪國家）。
 * user-level 資料（比照 friends），一支查詢餵整頁三個 tab。
 */
export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.all,
    queryFn: async (): Promise<CollectionsData> => {
      const res = await getCollections();
      return res.success ? res.data : EMPTY_COLLECTIONS;
    },
  });
}

/**
 * 飛行/住宿紀錄 mutations。成功後整包重抓（個人紀錄量小，比照 friends 不做細粒度快取手術）。
 */
export function useCollectionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: collectionKeys.all });

  const createFlight = useMutation({
    mutationFn: (input: CreateFlightRecordInput) => unwrap(createFlightRecord(input)),
    onSuccess: invalidate,
  });
  const updateFlight = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateFlightRecordInput }) =>
      unwrap(updateFlightRecord(id, input)),
    onSuccess: invalidate,
  });
  const removeFlight = useMutation({
    mutationFn: (id: string) => unwrap(deleteFlightRecord(id)),
    onSuccess: invalidate,
  });

  const createStay = useMutation({
    mutationFn: (input: CreateStayRecordInput) => unwrap(createStayRecord(input)),
    onSuccess: invalidate,
  });
  const updateStay = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStayRecordInput }) =>
      unwrap(updateStayRecord(id, input)),
    onSuccess: invalidate,
  });
  const removeStay = useMutation({
    mutationFn: (id: string) => unwrap(deleteStayRecord(id)),
    onSuccess: invalidate,
  });

  return { createFlight, updateFlight, removeFlight, createStay, updateStay, removeStay };
}
