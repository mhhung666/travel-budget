import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notes: vi.fn(), photos: vi.fn(), activity: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'trip' }) }));
vi.mock('@/actions', () => ({
  getNotes: mocks.notes,
  getTripPhotos: mocks.photos,
  getActivityLog: mocks.activity,
}));
vi.mock('@/hooks/queries', async () => {
  const { useNotes } = await import('@/hooks/queries/useNotes');
  const { usePhotos } = await import('@/hooks/queries/usePhotos');
  const { useActivityLog } = await import('@/hooks/queries/useActivityLog');
  const mutations = () => ({ update: {}, remove: {}, add: {}, create: {}, plan: {} });
  return {
    useNotes,
    usePhotos,
    useActivityLog,
    useNoteMutations: mutations,
    usePhotoMutations: mutations,
    useTripMembership: () => ({ isMember: false }),
    useItinerary: () => ({ data: [] }),
  };
});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/common', () => ({
  ConfirmDialog: () => null,
  EmptyState: () => <p>empty-resource</p>,
}));
vi.mock('@/components/skeletons', () => ({ ItinerarySkeleton: () => <p>resource-skeleton</p> }));
vi.mock('@/components/trips/detail/notes', () => ({
  NoteComposer: () => null,
  NoteCard: ({ note }: { note: { text: string } }) => <p>{note.text}</p>,
  NoteEditDialog: () => null,
  PlanNoteSheet: () => null,
}));
vi.mock('@/components/trips/detail/album', () => ({
  AlbumShareDialog: () => null,
  PhotoUploadButton: () => null,
  PhotoLightbox: () => null,
  PhotoGrid: ({ photos }: { photos: { caption: string }[] }) => <p>{photos[0]?.caption}</p>,
}));

import NotesPage from '@/app/(app)/trips/[id]/notes/page';
import AlbumPage from '@/app/(app)/trips/[id]/album/page';
import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { tripKeys } from '@/hooks/queries/keys';

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  onlineManager.setOnline(true);
});

const cases = [
  {
    name: 'notes',
    Page: NotesPage,
    action: mocks.notes,
    key: tripKeys.notes('trip'),
    rows: [{ id: 'n', text: 'cached-note', planned_at: null }],
    text: 'cached-note',
    empty: 'empty-resource',
  },
  {
    name: 'album',
    Page: AlbumPage,
    action: mocks.photos,
    key: tripKeys.photos('trip'),
    rows: [{ id: 'p', caption: 'cached-photo' }],
    text: 'cached-photo',
    empty: 'empty-resource',
  },
  {
    name: 'activity',
    Page: () => <ActivityFeed tripId="trip" />,
    action: mocks.activity,
    key: tripKeys.activity('trip'),
    rows: [
      {
        id: 'a',
        type: 'expense_added',
        actor_name: 'person',
        meta: {},
        created_at: '2026-09-08T00:00:00Z',
      },
    ],
    text: 'expenseAdded',
    empty: 'empty',
  },
];

describe.each(cases)('$name query feedback', ({ Page, action, key, rows, text, empty }) => {
  const mount = () =>
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>
    );

  it('preserves action failure and recovers to a genuine empty state through retry', async () => {
    action.mockResolvedValueOnce({
      success: false,
      error: 'private diagnostic',
      code: 'INTERNAL_ERROR',
    });
    action.mockResolvedValueOnce({ success: true, data: [] });
    mount();
    await screen.findByText('queryLoadFailed');
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument();
    expect(client.getQueryState(key)?.error).toMatchObject({ code: 'INTERNAL_ERROR' });
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByText(empty);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('keeps cached content visible during a refetch and after network failure', async () => {
    client.setQueryData(key, rows);
    // Photos deliberately have a longer staleTime; invalidation simulates a refresh.
    await client.invalidateQueries({ queryKey: key });
    let reject!: (error: Error) => void;
    action.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    mount();
    await screen.findByText('queryRefreshing');
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('resource-skeleton')).not.toBeInTheDocument();
    await act(async () => reject(new Error('network failed')));
    await screen.findByText('queryRefreshFailed');
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('does not treat an authorization failure as empty content', async () => {
    action.mockResolvedValue({ success: false, error: 'denied', code: 'FORBIDDEN' });
    mount();
    await screen.findByText('queryLoadFailed');
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
    expect(client.getQueryState(key)?.error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('shows waiting for connection instead of empty content on a paused cold query', async () => {
    onlineManager.setOnline(false);
    mount();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('queryPaused'));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByText(empty)).not.toBeInTheDocument();
  });
});
