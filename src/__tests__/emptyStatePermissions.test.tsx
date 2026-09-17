import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 空白引導要配合權限（docs/UX_IMPROVEMENTS.md 第 3 項）。
 * 沒有新增權限的人看到的說明，不能叫他去按畫面上不存在的按鈕。
 */

const state = vi.hoisted(() => ({ isMember: true, role: 'admin' as string | null }));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'trip' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useEditTrip', () => ({
  useEditTrip: () => ({
    editTripDialog: { open: false, openDialog: vi.fn(), closeDialog: vi.fn() },
    handleEditTrip: vi.fn(),
  }),
}));
vi.mock('@/components/trips/space/TripSpaceContext', () => ({
  useTripSpaceActions: () => ({ openAddExpense: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => {
  const empty = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  // 每個 mutation 名稱都給同一組空殼，頁面要哪個都拿得到。
  const mutations = () =>
    new Proxy({} as Record<string, unknown>, {
      get: (_target, key) =>
        key === 'mutateActivity' ? vi.fn() : { isPending: false, mutateAsync: vi.fn() },
    });
  return {
    useItinerary: () => empty,
    useCommentCounts: () => ({ ...empty, data: {} }),
    useChecklists: () => empty,
    usePhotos: () => empty,
    useNotes: () => empty,
    useSettlement: () => ({ ...empty, data: undefined }),
    useTripCollectionLinks: () => ({ ...empty, data: undefined }),
    useTrip: () => ({ ...empty, data: { start_date: '2026-01-01', end_date: '2026-01-03' } }),
    useTripShell: () => ({ data: { role: state.role } }),
    useTripMembership: () => ({
      currentUser: { id: 'me' },
      members: [],
      isMember: state.isMember,
      isAdmin: state.role === 'admin',
      isLoading: false,
      query: { data: true, isError: false, refetch: vi.fn() },
      isResolved: true,
    }),
    useItineraryMutations: mutations,
    useChecklistMutations: mutations,
    usePhotoMutations: mutations,
    useNoteMutations: mutations,
  };
});
vi.mock('@/components/common/ClientQueryBoundary', () => ({
  ClientQueryBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/trips/detail/TripContextOverview', () => ({ default: () => null }));
vi.mock('@/components/trips/DeferredDialogs', () => ({
  EditTripDialog: () => null,
  ItineraryDayDialog: () => null,
  ActivityFormDialog: () => null,
  ItineraryImportDialog: () => null,
  NewChecklistSheet: () => null,
  NoteEditDialog: () => null,
  PlanNoteSheet: () => null,
}));
vi.mock('@/components/collections/DeferredDialogs', () => ({
  FlightRecordDialog: () => null,
  StayRecordDialog: () => null,
}));
vi.mock('@/components/export', () => ({ ExportMenu: () => null }));
vi.mock('@/components/trips/detail/album', () => ({
  AlbumShareDialog: () => null,
  PhotoUploadButton: () => null,
  PhotoLightbox: () => null,
  PhotoGrid: () => null,
}));
vi.mock('@/components/trips/detail/notes', () => ({
  NoteComposer: () => null,
  NoteCard: () => null,
  NoteEditDialog: () => null,
  PlanNoteSheet: () => null,
}));

import TripExpenses from '@/components/trips/detail/TripExpenses';
import { EMPTY_EXPENSE_FILTERS } from '@/lib/expenseFilters';
import ItineraryPage from '@/app/(app)/trips/[id]/page';
import ChecklistsPage from '@/app/(app)/trips/[id]/checklists/page';
import NotesPage from '@/app/(app)/trips/[id]/notes/page';
import AlbumPage from '@/app/(app)/trips/[id]/album/page';

const cases = [
  { name: 'itinerary', Page: ItineraryPage, editorRole: 'admin', addLabel: 'addDay' },
  { name: 'checklists', Page: ChecklistsPage, editorRole: 'member', addLabel: 'addList' },
  { name: 'album', Page: AlbumPage, editorRole: 'member', addLabel: null },
  { name: 'notes', Page: NotesPage, editorRole: 'member', addLabel: null },
] as const;

beforeEach(() => {
  state.isMember = true;
  state.role = 'admin';
});
afterEach(cleanup);

/** 頁面內部仍會呼叫 useQueryClient，給一個乾淨的 client 就夠。 */
function renderPage(Page: () => React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
}

describe('empty states follow what the viewer may actually do', () => {
  it.each(cases)('$name tells an editor how to start', ({ Page, editorRole, addLabel }) => {
    state.role = editorRole;
    renderPage(Page);
    expect(screen.getByText('emptyStateHint')).toBeInTheDocument();
    expect(screen.queryByText('emptyStateHintReadOnly')).not.toBeInTheDocument();
    if (addLabel) expect(screen.getByRole('button', { name: addLabel })).toBeInTheDocument();
  });

  it.each(cases)('$name explains the wait instead of a missing button', ({ Page, addLabel }) => {
    state.isMember = false;
    state.role = null;
    renderPage(Page);
    expect(screen.getByText('emptyStateHintReadOnly')).toBeInTheDocument();
    expect(screen.queryByText('emptyStateHint')).not.toBeInTheDocument();
    if (addLabel) expect(screen.queryByRole('button', { name: addLabel })).not.toBeInTheDocument();
  });

  it.each([
    { role: 'member', isMember: true, hint: 'clickToAdd' },
    { role: null, isMember: false, hint: 'noExpensesReadOnly' },
  ])('expenses explain what a $role can do', ({ isMember, hint }) => {
    render(
      <TripExpenses
        tripId="trip"
        expenses={[]}
        members={[]}
        isCurrentUserMember={isMember}
        isCurrentUserAdmin={false}
        filters={EMPTY_EXPENSE_FILTERS}
        onFiltersChange={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('itinerary does not point a non-admin member at the add-day button', () => {
    state.role = 'member';
    renderPage(ItineraryPage);
    expect(screen.getByText('emptyStateHintReadOnly')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'addDay' })).not.toBeInTheDocument();
  });
});
