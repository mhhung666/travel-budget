import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TripWithMembers } from '@/types';
import { tripKeys } from '@/hooks/queries/keys';
import TripsPage from '@/app/(app)/trips/page';
import { ActionQueryError } from '@/lib/actionQuery';

const h = vi.hoisted(() => ({
  archive: vi.fn(),
  unarchive: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  read: vi.fn(),
  online: true,
}));
vi.mock('@/hooks/queries', () => ({
  tripKeys: { list: ['trips'] },
  useTrips: () =>
    useQuery({ queryKey: ['trips'], queryFn: h.read, staleTime: Infinity, retry: false }),
  useTripArchiveMutations: () => ({
    archive: { mutateAsync: h.archive },
    unarchive: { mutateAsync: h.unarchive },
  }),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/components/trips/DeferredDialogs', () => ({
  CreateTripDialog: () => null,
  JoinTripDialog: () => null,
  TripExpenseQuickAdd: ({ tripId }: { tripId: string }) => <div>expense-for-{tripId}</div>,
}));
const trip = (id: string, archived = false): TripWithMembers => ({
  id,
  name: `Long trip ${id} ${'完整旅行名稱 '.repeat(8)}`.trim(),
  hash_code: `code${id}`,
  description: 'Do not show this description',
  start_date: '2026-01-01',
  end_date: '2026-01-03',
  destination_location: null,
  created_at: '2026-01-01T00:00:00.000Z',
  archived_at: archived ? '2026-10-01T00:00:00Z' : null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
  member_count: 3,
  my_spent: 0,
  my_balance: 0,
  ledger: { baseCurrency: 'JPY', moneyScale: 2 },
});
let client: QueryClient;
let rows: TripWithMembers[];
beforeEach(() => {
  vi.clearAllMocks();
  h.online = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rows = [trip('a')];
  h.read.mockImplementation(async () => rows);
  client.setQueryData(tripKeys.list, rows);
});
afterEach(() => {
  cleanup();
  client.clear();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <TripsPage />
    </QueryClientProvider>
  );
async function chooseArchive(id = 'a') {
  const card = document.querySelector(`[data-trip-card="${id}"]`) as HTMLElement;
  const user = userEvent.setup();
  await user.click(within(card).getByRole('button', { name: 'card.more' }));
  await user.click(
    screen.getByRole('menuitem', {
      name: rows.find((r) => r.id === id)?.archived_at ? 'unarchive' : 'archive',
    })
  );
  return screen.getByRole('alertdialog');
}
it('uses one header create and join, no FAB, complete names and independent links/actions', async () => {
  mount();
  expect(screen.getAllByRole('button', { name: 'createTrip' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'joinTrip' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'title' })).toBeVisible();
  const heading = screen.getByRole('heading', { name: rows[0].name });
  expect(heading.className).not.toMatch(/truncate|line-clamp/);
  const main = heading.closest('a')!;
  expect(main).toHaveAttribute('href', '/trips/codea');
  expect(within(main).queryByRole('button')).toBeNull();
  expect(screen.queryByText(rows[0].description!)).toBeNull();
  expect(within(main).getByText('card.myShare')).toBeVisible();
  expect(within(main).getByText('card.noBalance')).toBeVisible();
  expect(within(main).getAllByText(/JPY/)).toHaveLength(2);
  await userEvent.setup().click(screen.getByRole('button', { name: 'card.quickExpense' }));
  expect(h.push).not.toHaveBeenCalled();
  expect(screen.getByText('expense-for-codea')).toBeVisible();
});
it('offers the only primary create in the truly empty state', () => {
  client.setQueryData(tripKeys.list, []);
  mount();
  expect(screen.getAllByRole('button', { name: 'createFirstTrip' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'createTrip' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'joinTrip' })).toHaveLength(1);
});
it('cancel names the selected trip and writes nothing, then restores heading focus', async () => {
  mount();
  const dialog = await chooseArchive();
  expect(within(dialog).getByText(rows[0].name)).toBeVisible();
  expect(within(dialog).getByText('archiveHint')).toBeVisible();
  await userEvent.setup().click(within(dialog).getByRole('button', { name: 'cancelArchive' }));
  expect(h.archive).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'title' })).toHaveFocus());
});
it('keeps a failed confirmation retryable, guards double send and prevents closing while sending', async () => {
  let reject!: (error: Error) => void;
  h.archive.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  mount();
  const dialog = await chooseArchive();
  const button = within(dialog).getByRole('button', { name: 'archive' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(h.archive).toHaveBeenCalledExactlyOnceWith('a');
  expect(within(dialog).getByRole('button', { name: 'cancelArchive' })).toBeDisabled();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).toBeVisible();
  await act(async () => reject(new Error('lost response')));
  expect(within(dialog).getByRole('alert')).toHaveTextContent('archiveFailed');
  expect(within(dialog).getByText(rows[0].name)).toBeVisible();
  h.archive.mockResolvedValueOnce({});
  await userEvent.setup().click(within(dialog).getByRole('button', { name: 'archive' }));
  expect(h.archive).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
it('restoring the last archived trip keeps its selected empty tab and focuses it', async () => {
  rows = [trip('a', true)];
  client.setQueryData(tripKeys.list, rows);
  h.unarchive.mockImplementation(async () => {
    rows = [{ ...rows[0], archived_at: null }];
    client.setQueryData(tripKeys.list, rows);
    return rows[0];
  });
  mount();
  await userEvent.setup().click(screen.getByRole('tab', { name: 'tabArchived (1)' }));
  const dialog = await chooseArchive();
  await userEvent.setup().click(within(dialog).getByRole('button', { name: 'unarchive' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  const tab = screen.getByRole('tab', { name: 'tabArchived (0)' });
  expect(tab).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('noArchivedTrips')).toBeVisible();
  await waitFor(() => expect(tab).toHaveFocus());
});
it('does not send an old confirmation after its trip disappears or access is denied', async () => {
  mount();
  await chooseArchive();
  await act(async () => {
    client.setQueryData(tripKeys.list, []);
  });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(h.archive).not.toHaveBeenCalled();
  await act(async () => {
    client.setQueryData(tripKeys.list, rows);
  });
  await waitFor(() => expect(screen.getByText(rows[0].name)).toBeVisible());
  await chooseArchive();
  h.read.mockRejectedValue(new ActionQueryError('Forbidden', 'FORBIDDEN'));
  await act(async () => {
    await client.refetchQueries({ queryKey: tripKeys.list });
  });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.queryByText(rows[0].name)).toBeNull();
});
it('disables online-only header/archive controls offline', async () => {
  h.online = false;
  mount();
  expect(screen.getByRole('button', { name: 'createTrip' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'joinTrip' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'card.more' }));
  expect(screen.getByRole('menuitem', { name: 'archive' })).toHaveAttribute('data-disabled');
  expect(h.archive).not.toHaveBeenCalled();
});
