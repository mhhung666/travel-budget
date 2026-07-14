'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLoyalty,
  upsertLoyaltyAccount,
  deleteLoyaltyAccount,
  createLoyaltyEntry,
  updateLoyaltyEntry,
  deleteLoyaltyEntry,
} from '@/actions';
import type { ActionResult } from '@/actions';
import type { LoyaltyData } from '@/types';
import type { UpsertLoyaltyAccountInput, CreateLoyaltyEntryInput } from '@/lib/validation';
import { loyaltyKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  // error 字串是穩定代碼（VALIDATION_ERROR / CONFLICT …），前端對 collections.errors.* i18n 表
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const EMPTY_LOYALTY: LoyaltyData = { accounts: [], entries: [] };

/**
 * 會籍總覽（我的全部會籍帳戶＋積分/里數 entries）。
 * user-level 資料（比照 collections），會籍 tab 與航空 tab 的「記入會籍」共用同一份快取。
 */
export function useLoyalty(enabled = true) {
  return useQuery({
    queryKey: loyaltyKeys.all,
    queryFn: async (): Promise<LoyaltyData> => {
      const res = await getLoyalty();
      return res.success ? res.data : EMPTY_LOYALTY;
    },
    enabled,
  });
}

/** 會籍帳戶/entry mutations。成功後整包重抓（個人紀錄量小，比照 collections）。 */
export function useLoyaltyMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: loyaltyKeys.all });
  };

  const upsertAccount = useMutation({
    mutationFn: (input: UpsertLoyaltyAccountInput) => unwrap(upsertLoyaltyAccount(input)),
    onSuccess: invalidate,
  });
  const removeAccount = useMutation({
    mutationFn: (id: string) => unwrap(deleteLoyaltyAccount(id)),
    onSuccess: invalidate,
  });

  const createEntry = useMutation({
    mutationFn: (input: CreateLoyaltyEntryInput) => unwrap(createLoyaltyEntry(input)),
    onSuccess: invalidate,
  });
  const updateEntry = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateLoyaltyEntryInput }) =>
      unwrap(updateLoyaltyEntry(id, input)),
    onSuccess: invalidate,
  });
  const removeEntry = useMutation({
    mutationFn: (id: string) => unwrap(deleteLoyaltyEntry(id)),
    onSuccess: invalidate,
  });

  return { upsertAccount, removeAccount, createEntry, updateEntry, removeEntry };
}
