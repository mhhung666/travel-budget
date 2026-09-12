import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExpenseForm } from '@/components/trips/detail/expense-form/useExpenseForm';
import { buildOptimisticExpense } from '@/lib/optimisticExpense';
import type { Member } from '@/types';

afterEach(() => vi.unstubAllGlobals());
it('restores all rejected input into an add form for correction without applying new-entry defaults', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true, rates: { USD: 35 } }) })
  );
  const members = [
    { id: 'payer', username: 'Payer', display_name: 'Payer' },
    { id: 'other', username: 'Other', display_name: 'Other' },
  ] as Member[];
  const input = {
    payer_id: 'payer',
    description: 'Dinner draft',
    original_amount: 12,
    currency: 'USD',
    exchange_rate: 30,
    category: 'food',
    date: '2026-09-01',
    splits: [
      { user_id: 'payer', share_amount: 300 },
      { user_id: 'other', share_amount: 60 },
    ],
    attachments: [{ key: 'receipt-key', content_type: 'image/jpeg', size: 120 }],
    tags: ['dinner'],
    itinerary_day_ids: ['day'],
  };
  const expense = buildOptimisticExpense(input, {
    tripId: 'trip',
    id: 'draft',
    members,
    createdAt: '2026-09-01T00:00:00Z',
  });
  const { result } = renderHook(() =>
    useExpenseForm({ mode: 'add', open: true, expense, members, currentUser: members[1] })
  );
  await waitFor(() => expect(result.current.loadingRates).toBe(false));
  expect(result.current.showAdvanced).toBe(true);
  expect(result.current.buildSubmitData()).toEqual({
    ...input,
    original_amount: '12',
    exchange_rate: '30',
  });
});
