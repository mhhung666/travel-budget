import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { tripKeys } from '@/hooks/queries/keys';
import { useItineraryMutations } from '@/hooks/queries/useItineraryMutations';

const actions = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
vi.mock('@/actions', () => ({
  createItineraryDay: actions.create,
  deleteItineraryDay: actions.remove,
  updateItineraryDay: vi.fn(),
  mutateItineraryActivity: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keys = [
    tripKeys.detail('trip'),
    tripKeys.itinerary('trip'),
    tripKeys.photos('trip'),
    tripKeys.expenses('trip'),
    tripKeys.stats('trip'),
  ];
  keys.forEach((key) => client.setQueryData(key, []));
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useItineraryMutations('trip'), { wrapper }) };
}

it('refreshes trip dates after another admin removes the start date', async () => {
  actions.create.mockResolvedValue({
    success: false,
    error: 'missing start',
    code: 'TRIP_START_DATE_REQUIRED',
  });
  const { client, result } = setup();
  await act(async () => {
    await expect(
      result.current.create.mutateAsync({ title: 'Draft', content: '' })
    ).rejects.toMatchObject({ code: 'TRIP_START_DATE_REQUIRED' });
  });
  expect(client.getQueryState(tripKeys.detail('trip'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(tripKeys.itinerary('trip'))?.isInvalidated).toBe(true);
});

it('invalidates cached expense relations and statistics after deleting a day', async () => {
  actions.remove.mockResolvedValue({ success: true, data: null });
  const { client, result } = setup();
  await act(async () => {
    await result.current.remove.mutateAsync('day');
  });
  for (const key of [
    tripKeys.itinerary('trip'),
    tripKeys.photos('trip'),
    tripKeys.expenses('trip'),
    tripKeys.stats('trip'),
  ]) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
});
