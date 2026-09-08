import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), count: vi.fn(), retry: vi.fn() }));
vi.mock('@/hooks/queries', () => ({
  useCollections: mocks.read,
  useFriends: mocks.read,
  useExpenseComments: mocks.read,
  useNotificationList: mocks.read,
  useUnreadNotificationCount: mocks.count,
  useNotificationPushSync: vi.fn(),
  useFriendMutations: () => ({ accept: {}, decline: {}, remove: {} }),
  useCommentMutations: () => ({ create: {}, remove: {} }),
  useNotificationMutations: () => ({ markRead: {}, markAllRead: {} }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/collections/FlightsTab', () => ({
  FlightsTab: () => <p>flights-content</p>,
}));
vi.mock('@/components/collections/StaysTab', () => ({ StaysTab: () => null }));
vi.mock('@/components/collections/CountriesTab', () => ({ CountriesTab: () => null }));
vi.mock('@/components/collections/BadgesTab', () => ({ BadgesTab: () => null }));
import { CollectionsView } from '@/components/collections/CollectionsView';
import { FriendsSection } from '@/components/friends/FriendsSection';
import { ExpenseComments } from '@/components/expenses/ExpenseComments';
import { NotificationBell } from '@/components/notifications/NotificationBell';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockReturnValue({
    data: undefined,
    isError: true,
    isLoading: false,
    refetch: mocks.retry,
  });
  mocks.count.mockReturnValue({ data: 0, refetch: vi.fn() });
});
afterEach(cleanup);

describe.each([
  { name: 'collections', Page: CollectionsView },
  { name: 'friends', Page: FriendsSection },
  {
    name: 'comments',
    Page: () => (
      <ExpenseComments tripId="trip" expenseId="expense" currentUserId="user" isAdmin={false} />
    ),
  },
])('$name consumer', ({ Page }) => {
  it('renders a retry action instead of an empty list or permanent skeleton', () => {
    render(<Page />);
    expect(screen.getByText('queryLoadFailed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
});

it('preserves the collections tabs after a failed refresh', () => {
  mocks.read.mockReturnValue({
    data: { flights: [], stays: [], countries: [] },
    isError: true,
    refetch: mocks.retry,
  });
  render(<CollectionsView />);
  expect(screen.getByText('queryRefreshFailed')).toBeInTheDocument();
  expect(screen.getByText('flights-content')).toBeInTheDocument();
});

it('offers notification-list retry when opening a failed panel, not an empty inbox', () => {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: 'title' }));
  expect(screen.getByText('queryLoadFailed')).toBeInTheDocument();
  expect(screen.queryByText('empty')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(mocks.retry).toHaveBeenCalledOnce();
});
