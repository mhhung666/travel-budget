'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordPayment, deletePayment, remindPayment } from '@/actions';
import type { ActionResult } from '@/actions';
import type { RecordPaymentInput } from '@/lib/validation';
import { tripKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * Settlement payment (record / delete) mutations for a trip.
 *
 * Both invalidate the settlement query — recording or removing a payment
 * re-nets the balances and the suggested transfers — so the settlement view
 * refetches in the background.
 */
export function usePaymentMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: tripKeys.settlement(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.activity(tripId) });
  };

  const record = useMutation({
    mutationFn: (input: RecordPaymentInput) => unwrap(recordPayment(tripId, input)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (paymentId: string) => unwrap(deletePayment(tripId, paymentId)),
    onSuccess: invalidate,
  });

  // 提醒還款：對欠款的成員寄出提醒 Email。不改動結算資料，故不需 invalidate。
  const remind = useMutation({
    mutationFn: (debtorId: string) => unwrap(remindPayment(tripId, debtorId)),
  });

  return { record, remove, remind };
}
