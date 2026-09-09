import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useItineraryMutations } from '@/hooks/queries/useItineraryMutations';
import ActivityFormDialog from '@/components/trips/detail/itinerary/ActivityFormDialog';
import ItineraryDayDialog from '@/components/trips/detail/itinerary/ItineraryDayDialog';
import { tripKeys } from '@/hooks/queries/keys';
import type { Activity, ItineraryDay } from '@/types';

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: vi.fn(), close: vi.fn() }));
vi.mock('@/actions', () => ({
  createItineraryDay: vi.fn(),
  updateItineraryDay: mocks.update,
  deleteItineraryDay: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/location/LocationAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/trips/detail/itinerary/MarkdownRenderer', () => ({ default: () => null }));
vi.mock('@/components/trips/detail/itinerary/ActivityListEditor', async () => ({
  ...(await import('@/lib/activityDraft')),
  ActivityCard: ({
    activity,
    onChange,
  }: {
    activity: { title: string };
    onChange: (fields: { title: string }) => void;
  }) => (
    <input
      aria-label="activity title"
      value={activity.title}
      onChange={(event) => onChange({ title: event.target.value })}
    />
  ),
}));

const activity: Activity = {
  id: 'activity',
  title: 'Original',
  type: 'other',
  time: null,
  end_time: null,
  location: null,
  location_name: '',
  note: '',
  confirmation_code: '',
  attachments: [],
};
const day: ItineraryDay = {
  id: 'day',
  trip_id: 'trip',
  day_number: 1,
  title: 'Original day',
  content: '',
  location: null,
  activities: [activity],
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};
function Editor({ mode }: { mode: 'activity' | 'day' }) {
  const { update } = useItineraryMutations('trip');
  return mode === 'activity' ? (
    <ActivityFormDialog
      open
      onClose={mocks.close}
      tripId="trip"
      activity={activity}
      onSubmit={async (payload) => {
        await update.mutateAsync({
          dayId: day.id,
          data: { activities: [payload], expected_updated_at: day.updated_at },
        });
      }}
    />
  ) : (
    <ItineraryDayDialog
      open
      mode="edit"
      onClose={mocks.close}
      day={day}
      onSubmit={async (data) => {
        await update.mutateAsync({
          dayId: day.id,
          data: { ...data, expected_updated_at: day.updated_at },
        });
      }}
    />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each(['activity', 'day'] as const)(
  'keeps the %s draft and original token when a conflict refreshes the cache',
  async (mode) => {
    mocks.update.mockResolvedValue({
      success: false,
      error: 'private failure detail',
      code: 'CONFLICT',
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(tripKeys.itinerary('trip'), [day]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Editor mode={mode} />
      </QueryClientProvider>
    );
    const input =
      mode === 'activity'
        ? screen.getByLabelText('activity title')
        : screen.getByLabelText('dayTitle');
    fireEvent.change(input, { target: { value: 'My unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        description: 'updateConflict',
        variant: 'destructive',
      })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: tripKeys.itinerary('trip') });
    await act(async () => {
      client.setQueryData(tripKeys.itinerary('trip'), [
        { ...day, title: 'Other editor', updated_at: '2026-07-02T00:00:00.000Z' },
      ]);
    });
    expect(input).toHaveValue('My unsaved draft');
    expect(mocks.close).not.toHaveBeenCalled();
    expect(screen.queryByText('private failure detail')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'save' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    for (const call of mocks.update.mock.calls) {
      expect(call[2]).toMatchObject({ expected_updated_at: day.updated_at });
    }
    client.clear();
  }
);
